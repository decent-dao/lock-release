import { BigNumber } from '@ethersproject/bignumber';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import {
  LockRelease, LockRelease__factory,
  Mintable, Mintable__factory
} from '../typechain';
import time from './time';

describe('LockRelease', () => {
  let owner: SignerWithAddress,
    beneficiary1: SignerWithAddress,
    beneficiary2: SignerWithAddress,
    beneficiary3: SignerWithAddress,
    recipient: SignerWithAddress;

  let lockRelease: LockRelease,
    token1: Mintable,
    token2: Mintable,
    token3: Mintable;

  const duration1 = time.duration.years(1);
  const duration2 = time.duration.years(2);
  const duration3 = time.duration.years(3);

  const amount = BigNumber.from('1000');
  const mintAmount = BigNumber.from('20000');

  beforeEach(async function () {
    [owner, beneficiary1, beneficiary2, beneficiary3, recipient] = await ethers.getSigners();

    lockRelease = await new LockRelease__factory(owner).deploy();
    token1 = await new Mintable__factory(owner).deploy();
    token2 = await new Mintable__factory(owner).deploy();
    token3 = await new Mintable__factory(owner).deploy();

    await token1.mint(owner.address, mintAmount);
    await token2.mint(owner.address, mintAmount);
    await token3.mint(owner.address, mintAmount);

    await token1.approve(lockRelease.address, mintAmount);
    await token2.approve(lockRelease.address, mintAmount);
    await token3.approve(lockRelease.address, mintAmount);
  });

  it('reverts with a zero beneficiary', async function () {
    await expect(
      lockRelease.createSchedule(token1.address, ethers.constants.AddressZero, amount, 0, duration1)
    ).to.be.revertedWith("LockRelease: beneficiary is the zero address");
  });

  it('reverts with a zero token', async function () {
    await expect(
      lockRelease.createSchedule(ethers.constants.AddressZero, beneficiary1.address, amount, 0, duration1)
    ).to.be.revertedWith("LockRelease: token is the zero address");
  });

  it('reverts with a zero total', async function () {
    await expect(
      lockRelease.createSchedule(token1.address, beneficiary1.address, 0, 0, duration1)
    ).to.be.revertedWith("LockRelease: total is zero");
  });

  it('reverts with a null duration', async function () {
    await expect(
      lockRelease.createSchedule(token1.address, beneficiary1.address, amount, 0, 0)
    ).to.be.revertedWith("LockRelease: duration is 0");
  });

  it('reverts with a duplicate schedule', async function () {
    await lockRelease.createSchedule(token1.address, beneficiary1.address, amount, 0, duration1);
    await expect(
      lockRelease.createSchedule(token1.address, beneficiary1.address, amount, 0, duration1)
    ).to.be.revertedWith("LockRelease: Schedule already created for this token => beneficiary");
  });

  it('reverts with contract not approved to transfer tokens', async function () {
    await token2.approve(lockRelease.address, 0);
    await expect(
      lockRelease.createSchedule(token2.address, beneficiary1.address, amount, 0, duration1)
    ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
  });

  it('reverts with contract transferring more than approved', async function () {
    await expect(
      lockRelease.createSchedule(token1.address, beneficiary2.address, 30000, 0, duration1)
    ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
  });

  it('transfers tokens to contract address', async function () {
    await lockRelease.createSchedule(token1.address, beneficiary1.address, amount, 0, duration1);
    expect(await token1.balanceOf(lockRelease.address)).to.equal(amount);
  });

  context('once schedule has started', function () {
    let start: BigNumber,
      durationSchedule: BigNumber;

    beforeEach(async function () {
      await lockRelease.createSchedule(token1.address, beneficiary1.address, amount, await time.latest(), duration1);
      start = await lockRelease.getStart(token1.address, beneficiary1.address);
      durationSchedule = await lockRelease.getDuration(token1.address, beneficiary1.address);
    });

    it('can get state', async function () {
      expect(await lockRelease.getTotal(token1.address, beneficiary1.address)).to.equal(amount);
    });

    it('can be released', async function () {
      await time.increaseTo(start.add(durationSchedule).toNumber());

      await expect(lockRelease['release(address,address)'](token1.address, beneficiary1.address))
        .to.emit(lockRelease, 'TokensReleased')
        .withArgs(token1.address, beneficiary1.address, beneficiary1.address, amount, owner.address);
    });

    it('can be releasedTo', async function () {
      await time.increaseTo(start.add(durationSchedule).toNumber());

      await expect(lockRelease.connect(beneficiary1)['releaseTo(address,address)'](token1.address, recipient.address))
        .to.emit(lockRelease, 'TokensReleased')
        .withArgs(token1.address, beneficiary1.address, recipient.address, amount, beneficiary1.address);
    });

    it('release reverts with beneficiary scheduled time is < 0', async function () {
      await expect(
        lockRelease['release(address,address)'](token1.address, beneficiary1.address)
      ).to.be.revertedWith("LockRelease: no tokens are due");
    });

    it('releaseTo reverts with beneficiary scheduled time is < 0', async function () {
      await expect(
        lockRelease.connect(beneficiary1)['releaseTo(address,address)'](token1.address, recipient.address)
      ).to.be.revertedWith("LockRelease: no tokens are due");
    });

    it('release reverts with beneficiary does not exist', async function () {
      await expect(
        lockRelease['release(address,address)'](token1.address, beneficiary2.address)
      ).to.be.revertedWith("LockRelease: no tokens are due");
    });

    it('releaseTo reverts with beneficiary does not exist', async function () {
      await expect(
        lockRelease.connect(beneficiary2)['releaseTo(address,address)'](token1.address, recipient.address)
      ).to.be.revertedWith("LockRelease: no tokens are due");
    });

    it('release reverts with token does not exist', async function () {
      await expect(
        lockRelease['release(address,address)'](token2.address, beneficiary2.address)
      ).to.be.revertedWith("LockRelease: no tokens are due");
    });

    it('releaseTo reverts with token does not exist', async function () {
      await expect(
        lockRelease.connect(beneficiary2)['release(address,address)'](token2.address, recipient.address)
      ).to.be.revertedWith("LockRelease: no tokens are due");
    });

    it('should release proper amount', async function () {
      await time.increaseTo(start.add(duration1).toNumber());

      await lockRelease['release(address,address)'](token1.address, beneficiary1.address);
      const releaseTime = await time.latest();

      const releasedAmount = amount.mul(BigNumber.from(releaseTime).sub(start)).div(durationSchedule);
      expect(await token1.balanceOf(beneficiary1.address)).to.equal(releasedAmount);
      expect(await lockRelease.getReleased(token1.address, beneficiary1.address)).to.equal(releasedAmount);
    });

    it('release should linearly release tokens during maturing period', async function () {
      const maturingPeriod = durationSchedule;
      const checkpoints = 4;

      for (let i = 1; i <= checkpoints; i++) {
        const now = start.add((maturingPeriod.mul(i).div(checkpoints)));
        await time.increaseTo(now.toNumber());

        await lockRelease['release(address,address)'](token1.address, beneficiary1.address);
        const expectedMaturing = amount.mul(now.sub(start)).div(durationSchedule);
        expect(await token1.balanceOf(beneficiary1.address)).to.equal(expectedMaturing);
        expect(await lockRelease.getReleased(token1.address, beneficiary1.address)).to.equal(expectedMaturing);
      }
    });

    it('releaseTo should linearly release tokens during maturing period', async function () {
      const maturingPeriod = durationSchedule;
      const checkpoints = 4;

      for (let i = 1; i <= checkpoints; i++) {
        const now = start.add((maturingPeriod.mul(i).div(checkpoints)));
        await time.increaseTo(now.toNumber());

        await lockRelease.connect(beneficiary1)['releaseTo(address,address)'](token1.address, recipient.address);
        const expectedMaturing = amount.mul(now.sub(start)).div(durationSchedule);
        expect(await token1.balanceOf(recipient.address)).to.equal(expectedMaturing);
        expect(await lockRelease.getReleased(token1.address, beneficiary1.address)).to.equal(expectedMaturing);
      }
    });

    it('should have released all after end', async function () {
      await time.increaseTo(start.add(durationSchedule).toNumber());
      await lockRelease['release(address,address)'](token1.address, beneficiary1.address);
      expect(await token1.balanceOf(beneficiary1.address)).to.equal(amount);
      expect(await lockRelease.getReleased(token1.address, beneficiary1.address)).to.equal(amount);
    });
  });

  context('multiple beneficiary/durations/tokens', function () {
    it('can get state (multiple beneficiaries)', async function () {
      await lockRelease.createSchedule(token1.address, beneficiary1.address, amount, await time.latest(), duration1);
      await lockRelease.createSchedule(token1.address, beneficiary2.address, amount, await time.latest(), duration1);
      await lockRelease.createSchedule(token1.address, beneficiary3.address, amount, await time.latest(), duration1);

      // beneficiary1
      expect(await lockRelease.getTotal(token1.address, beneficiary1.address)).to.equal(amount);
      expect(await lockRelease.getDuration(token1.address, beneficiary1.address)).to.equal(duration1);

      // beneficiary2
      expect(await lockRelease.getTotal(token1.address, beneficiary2.address)).to.equal(amount);
      expect(await lockRelease.getDuration(token1.address, beneficiary2.address)).to.equal(duration1);

      // beneficiary3
      expect(await lockRelease.getTotal(token1.address, beneficiary3.address)).to.equal(amount);
      expect(await lockRelease.getDuration(token1.address, beneficiary3.address)).to.equal(duration1);
    });

    it('can get state (multiple durations)', async function () {
      await lockRelease.createSchedule(token1.address, beneficiary1.address, amount, await time.latest(), duration1);
      await lockRelease.createSchedule(token1.address, beneficiary2.address, amount, await time.latest(), duration2);
      await lockRelease.createSchedule(token1.address, beneficiary3.address, amount, await time.latest(), duration3);

      // duration1
      expect(await lockRelease.getTotal(token1.address, beneficiary1.address)).to.equal(amount);
      expect(await lockRelease.getDuration(token1.address, beneficiary1.address)).to.equal(duration1);

      // duration2
      expect(await lockRelease.getTotal(token1.address, beneficiary2.address)).to.equal(amount);
      expect(await lockRelease.getDuration(token1.address, beneficiary2.address)).to.equal(duration2);

      // duration3
      expect(await lockRelease.getTotal(token1.address, beneficiary3.address)).to.equal(amount);
      expect(await lockRelease.getDuration(token1.address, beneficiary3.address)).to.equal(duration3);
    });

    it('can get state (multiple tokens)', async function () {
      await lockRelease.createSchedule(token1.address, beneficiary1.address, amount, await time.latest(), duration1);
      await lockRelease.createSchedule(token2.address, beneficiary1.address, amount, await time.latest(), duration1);
      await lockRelease.createSchedule(token3.address, beneficiary1.address, amount, await time.latest(), duration1);

      // token1
      expect(await lockRelease.getTotal(token1.address, beneficiary1.address)).to.equal(amount);
      expect(await lockRelease.getDuration(token1.address, beneficiary1.address)).to.equal(duration1);

      // token2
      expect(await lockRelease.getTotal(token2.address, beneficiary1.address)).to.equal(amount);
      expect(await lockRelease.getDuration(token2.address, beneficiary1.address)).to.equal(duration1);

      // token3
      expect(await lockRelease.getTotal(token3.address, beneficiary1.address)).to.equal(amount);
      expect(await lockRelease.getDuration(token3.address, beneficiary1.address)).to.equal(duration1);
    });

    it('can get state (start schedules at a different time)', async function () {
      await lockRelease.createSchedule(token1.address, beneficiary1.address, amount, await time.latest(), duration1);
      const start = await lockRelease.getStart(token1.address, beneficiary1.address);
      await time.increaseTo(start.add(duration1).toNumber());
      await lockRelease.createSchedule(token1.address, beneficiary2.address, amount, await time.latest(), duration1);

      // schedule1
      expect(await lockRelease.getTotal(token1.address, beneficiary1.address)).to.equal(amount);
      expect(await lockRelease.getDuration(token1.address, beneficiary1.address)).to.equal(duration1);

      // schedule2
      expect(await lockRelease.getTotal(token1.address, beneficiary2.address)).to.equal(amount);
      expect(await lockRelease.getDuration(token1.address, beneficiary2.address)).to.equal(duration1);
    });

    it('can get state(for an address that has released tokens and started a new schedule)', async function () {
      await lockRelease.createSchedule(token1.address, beneficiary1.address, amount, await time.latest(), duration1);
      const start = await lockRelease.getStart(token1.address, beneficiary1.address);
      const durationSchedule = await lockRelease.getDuration(token1.address, beneficiary1.address);
      await time.increaseTo(start.add(durationSchedule).toNumber());
      await lockRelease['release(address,address)'](token1.address, beneficiary1.address);

      // schedule with same beneficiary
      await lockRelease.createSchedule(token2.address, beneficiary1.address, amount, await time.latest(), duration1);

      // schedule1
      expect(await token1.balanceOf(beneficiary1.address)).to.equal(amount);
      expect(await lockRelease.getReleased(token1.address, beneficiary1.address)).to.equal(amount);

      // schedule2
      expect(await lockRelease.getTotal(token2.address, beneficiary1.address)).to.equal(amount);
      expect(await lockRelease.getDuration(token2.address, beneficiary1.address)).to.equal(duration1);
    });

    it('can get state(for an address that has releasedTo tokens and started a new schedule)', async function () {
      await lockRelease.createSchedule(token1.address, beneficiary1.address, amount, await time.latest(), duration1);
      const start = await lockRelease.getStart(token1.address, beneficiary1.address);
      const durationSchedule = await lockRelease.getDuration(token1.address, beneficiary1.address);
      await time.increaseTo(start.add(durationSchedule).toNumber());
      await lockRelease.connect(beneficiary1)['releaseTo(address,address)'](token1.address, recipient.address);

      // schedule with same beneficiary
      await lockRelease.createSchedule(token2.address, beneficiary1.address, amount, await time.latest(), duration1);

      // schedule1
      expect(await token1.balanceOf(recipient.address)).to.equal(amount);
      expect(await lockRelease.getReleased(token1.address, beneficiary1.address)).to.equal(amount);

      // schedule2
      expect(await lockRelease.getTotal(token2.address, beneficiary1.address)).to.equal(amount);
      expect(await lockRelease.getDuration(token2.address, beneficiary1.address)).to.equal(duration1);
    });
  });

  context("creating a schedule with start date in past", function () {
    let startDateInThePast: number;

    beforeEach(async function () {
      startDateInThePast = await time.latest() - duration1 / 2;
    });

    context("the current time is in the middle of the schedule", function () {
      beforeEach(async function () {
        await lockRelease.createSchedule(token1.address, beneficiary1.address, amount, startDateInThePast, duration1);
      });

      it("calculates the correct amount of tokens that have been matured", async function () {
        const matured = await lockRelease.getTotalMatured(token1.address, beneficiary1.address);
        expect(matured).to.equal(amount.div(2));
      });

      it("calculates the correct amount of tokens to be released", async function () {
        const releasable = await lockRelease.getReleasable(token1.address, beneficiary1.address);
        expect(releasable).to.equal(amount.div(2));
      });
    });

    context("the current time is after the schedule has ended", function () {
      beforeEach(async function () {
        await lockRelease.createSchedule(token1.address, beneficiary1.address, amount, startDateInThePast, duration1);
        await time.increase(duration1 * 2);
      });

      it("calculates that all tokens have matured", async function () {
        const matured = await lockRelease.getTotalMatured(token1.address, beneficiary1.address);
        expect(matured).to.equal(amount);
      });

      it("calculates that all tokens can be released", async function () {
        const releasable = await lockRelease.getReleasable(token1.address, beneficiary1.address);
        expect(releasable).to.equal(amount);
      });
    });
  });

  context("creating a schedule with start date in future", function () {
    let startDateInTheFuture: number;

    beforeEach(async function () {
      startDateInTheFuture = await time.latest() + duration1;
    });

    beforeEach(async function () {
      await lockRelease.createSchedule(token1.address, beneficiary1.address, amount, startDateInTheFuture, duration1);
    });

    it("says no tokens are matured", async function () {
      const matured = await lockRelease.getTotalMatured(token1.address, beneficiary1.address);
      expect(matured).to.equal(0);
    });

    it("says no tokens are releasable", async function () {
      const releasable = await lockRelease.getReleasable(token1.address, beneficiary1.address);
      expect(releasable).to.equal(0);
    });

    context("checking info after maturing starts", function () {
      beforeEach(async function () {
        await time.increase(duration1 * 2);
      });

      it("says some tokens are matured", async function () {
        const matured = await lockRelease.getTotalMatured(token1.address, beneficiary1.address);
        expect(matured).to.be.above(0);
      });

      it("says some tokens are releasable", async function () {
        const releasable = await lockRelease.getReleasable(token1.address, beneficiary1.address);
        expect(releasable).to.be.above(0);
      });
    });
  });

  context("releasing a specific number of tokens", function () {
    context("claiming more tokens than are due", function () {
      beforeEach(async function () {
        await lockRelease.createSchedule(token1.address, beneficiary1.address, amount, await time.latest(), duration1);
      });

      it("should fail", async function () {
        await time.increase(duration1 / 2);
        await expect(
          lockRelease['release(address,address,uint256)'](token1.address, beneficiary1.address, amount)
        ).to.be.revertedWith("LockRelease: too many tokens being claimed");
      });
    });

    context("claiming less than the amount of tokens that are due", function () {
      beforeEach(async function () {
        await lockRelease.createSchedule(token1.address, beneficiary1.address, amount, await time.latest(), duration1);
      });

      it("should release the requested amount", async function () {
        await time.increase(duration1);
        await lockRelease['release(address,address,uint256)'](token1.address, beneficiary1.address, amount.div(2));
        expect(await token1.balanceOf(beneficiary1.address)).to.equal(amount.div(2));
      });
    });
  });

  context("releasing to a specific number of tokens", function () {
    context("claiming more tokens than are due", function () {
      beforeEach(async function () {
        await lockRelease.createSchedule(token1.address, beneficiary1.address, amount, await time.latest(), duration1);
      });

      it("should fail", async function () {
        await time.increase(duration1 / 2);
        await expect(
          lockRelease.connect(beneficiary1)['releaseTo(address,address,uint256)'](token1.address, beneficiary2.address, amount)
        ).to.be.revertedWith("LockRelease: too many tokens being claimed");
      });
    });

    context("claiming less than the amount of tokens that are due", function () {
      beforeEach(async function () {
        await lockRelease.createSchedule(token1.address, beneficiary1.address, amount, await time.latest(), duration1);
      });

      it("should release the requested amount to the specific address", async function () {
        await time.increase(duration1)
        await lockRelease.connect(beneficiary1)['releaseTo(address,address,uint256)'](token1.address, beneficiary2.address, amount.div(2));
        expect(await token1.balanceOf(beneficiary2.address)).to.equal(amount.div(2));
      });
    });
  });
});
