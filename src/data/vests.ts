import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { BigNumber } from 'ethers';
import {
  GeneralTokenVesting,
  IERC20Metadata, IERC20Metadata__factory,
} from '../../contracts/typechain';
import { TypedEventFilter } from '../../contracts/typechain/common';
import { VestStartedEvent } from '../../contracts/typechain/GeneralTokenVesting';
import { useWeb3 } from '../web3';

type VestId = {
  id: string,
  token: string,
  beneficiary: string,
  creator: string,
}

export type ERC20Token = {
  address: string,
  instance: IERC20Metadata,
  name: string,
  symbol: string,
  decimals: number,
}

type VestPeriod = {
  vestId: VestId,
  start: number,
  end: number,
}

type VestTotalAmount = {
  vestId: VestId,
  totalAmount: BigNumber,
}

type VestPerSecond = {
  vestId: VestId,
  perSecond: BigNumber,
}

type VestVestedAmount = {
  vestId: VestId,
  vestedAmount: BigNumber,
}

type VestClaimedAmount = {
  vestId: VestId,
  claimedAmount: BigNumber,
}

type VestClaimableAmount = {
  vestId: VestId,
  claimableAmount: BigNumber,
}

export enum VestStatusType {
  Active,
  OverAndClaimable,
  Completed,
}

export const VEST_STATUS_ACTIVE_EMOJI = "💃"
export const VEST_STATUS_ACTIVE_DESCRIPTION = "active"

export const VEST_STATUS_OVER_AND_CLAIMABLE_EMOJI = "🤏"
export const VEST_STATUS_OVER_AND_CLAIMABLE_DESCRIPTION = "over and claimable"

export const VEST_STATUS_COMPLETED_EMOJI = "🤝"
export const VEST_STATUS_COMPLETED_DESCRIPTION = "completed"

type VestStatus = {
  vestId: VestId,
  statusType: VestStatusType,
  statusEmoji: string,
  statusDescription: string,
}

export type Vest = {
  id: string,
  beneficiary: string,
  token: ERC20Token,
  creator: string,
  start: number,
  end: number,
  totalAmount: BigNumber,
  vestedAmount: BigNumber,
  claimedAmount: BigNumber,
  claimableAmount: BigNumber,
  statusType: VestStatusType,
  statusEmoji: string,
  statusDescription: string,
}

const useVestIds = (generalTokenVesting: GeneralTokenVesting | undefined, deploymentBlock: number | undefined) => {
  const { provider } = useWeb3();
  const [vestIds, setVestIds] = useState<VestId[]>([]);
  const [loading, setLoading] = useState(true);

  const [queryPageSize] = useState(10000);
  const [endBlock, setEndBlock] = useState<number>();
  const [allVestsFilter, setAllVestsFilter] = useState<TypedEventFilter<[string, string, BigNumber], { token: string; beneficiary: string; amount: BigNumber; }>>();

  useEffect(() => {
    if (!provider) {
      setEndBlock(undefined);
      return;
    }

    if (endBlock !== undefined) {
      return;
    }

    provider.getBlockNumber()
      .then(setEndBlock)
      .catch(console.error);
  }, [endBlock, provider]);

  useEffect(() => {
    if (!generalTokenVesting) {
      setAllVestsFilter(undefined);
      return;
    }

    setAllVestsFilter(generalTokenVesting.filters.VestStarted());
  }, [generalTokenVesting]);

  useEffect(() => {
    if (endBlock === undefined || deploymentBlock === undefined) {
      setLoading(true);
      return;
    }

    if (endBlock === deploymentBlock) {
      setLoading(false);
    }
  }, [endBlock, deploymentBlock]);

  useEffect(() => {
    if (!generalTokenVesting || !allVestsFilter || endBlock === undefined || deploymentBlock === undefined) {
      setVestIds([]);
      return;
    }

    if (endBlock === deploymentBlock) {
      return;
    }

    let startBlock = endBlock - queryPageSize + 1;
    if (startBlock < deploymentBlock) {
      startBlock = deploymentBlock;
    }

    const addVests = (vestEvents: VestStartedEvent[]) => {
      Promise.all(vestEvents.map(vestEvent => Promise.all([vestEvent, vestEvent.getTransaction()])))
        .then(vests => {
          const sortedVests = vests
            .sort(([aEvent], [bEvent]) => bEvent.blockNumber - aEvent.blockNumber)
            .map(([vestEvent, transaction]) => ({
              id: `${vestEvent.args.token}-${vestEvent.args.beneficiary}`,
              token: vestEvent.args.token,
              beneficiary: vestEvent.args.beneficiary,
              creator: transaction.from,
            }));

          setVestIds(allVests => {
            const newAllVests = [...(allVests || []), ...sortedVests];
            return newAllVests;
          });
        })
        .catch(console.error);
    }

    generalTokenVesting.queryFilter(allVestsFilter, startBlock, endBlock)
      .then(newVests => {
        if (newVests.length > 0) {
          addVests(newVests);
        }
      })
      .then(() => {
        setEndBlock(endBlock => {
          if (!endBlock) {
            return undefined;
          }

          let newEndBlock = endBlock - queryPageSize;
          if (newEndBlock < deploymentBlock) {
            newEndBlock = deploymentBlock;
          }

          return newEndBlock;
        });
      })
      .catch(console.error);
  }, [allVestsFilter, deploymentBlock, endBlock, generalTokenVesting, queryPageSize]);

  useEffect(() => {
    if (!generalTokenVesting || !allVestsFilter) {
      setVestIds([]);
      return;
    }

    const addVest = (_: string, __: string, ___: BigNumber, vestEvent: VestStartedEvent) => {
      vestEvent.getTransaction()
        .then(transaction => {
          const newVestId = {
            id: `${vestEvent.args.token}-${vestEvent.args.beneficiary}`,
            token: vestEvent.args.token,
            beneficiary: vestEvent.args.beneficiary,
            creator: transaction.from,
          };

          setVestIds(vestIds => {
            const newVestIds = [newVestId, ...(vestIds || [])];
            return newVestIds;
          });
        })
        .catch(console.error);
    }

    generalTokenVesting.on(allVestsFilter, addVest);

    return () => {
      generalTokenVesting.off(allVestsFilter, addVest);
    }
  }, [allVestsFilter, generalTokenVesting]);

  return [vestIds, loading] as const;
}

const useVestTokens = (vestIds: VestId[]) => {
  const { signerOrProvider } = useWeb3();
  const [tokens, setTokens] = useState<ERC20Token[]>([]);

  useEffect(() => {
    const uniqueVestTokenAddresses = [...new Set(vestIds.map(vestId => vestId.token))];

    if (uniqueVestTokenAddresses.length === tokens.length) {
      return;
    }

    if (!signerOrProvider || vestIds.length === 0) {
      setTokens([]);
      return;
    }

    Promise.all(uniqueVestTokenAddresses.map(tokenAddress => {
      const erc20Instance = IERC20Metadata__factory.connect(tokenAddress, signerOrProvider);
      return Promise.all([tokenAddress, erc20Instance, erc20Instance.name(), erc20Instance.symbol(), erc20Instance.decimals()]);
    }))
      .then(tokenData => {
        const tokens: ERC20Token[] = tokenData.map(([address, instance, name, symbol, decimals]) => ({
          address,
          instance,
          name,
          symbol,
          decimals,
        }));

        setTokens(tokens);
      })
      .catch(console.error);
  }, [signerOrProvider, vestIds, tokens]);

  return tokens;
}

const useVestPeriods = (generalTokenVesting: GeneralTokenVesting | undefined, vestIds: VestId[]) => {
  const [vestPeriods, setVestPeriods] = useState<VestPeriod[]>([]);

  useEffect(() => {
    if (vestIds.length === vestPeriods.length) {
      return;
    }

    if (!generalTokenVesting) {
      setVestPeriods([]);
      return;
    }

    Promise.all(vestIds.map(vestId => {
      const vestPeriod = vestPeriods.find(p => p.vestId.id === vestId.id);
      if (vestPeriod) {
        return Promise.all([vestId, BigNumber.from(vestPeriod.start), BigNumber.from(vestPeriod.end - vestPeriod.start)]);
      }
      return Promise.all([vestId, generalTokenVesting.getStart(vestId.token, vestId.beneficiary), generalTokenVesting.getDuration(vestId.token, vestId.beneficiary)]);
    }))
      .then(periodData => {
        const periods: VestPeriod[] = periodData.map(([vestId, start, duration]) => ({
          vestId: vestId,
          start: start.toNumber(),
          end: start.add(duration).toNumber(),
        }));

        setVestPeriods(periods);
      })
      .catch(console.error);
  }, [generalTokenVesting, vestIds, vestPeriods]);

  return vestPeriods;
}

const useVestTotalAmounts = (generalTokenVesting: GeneralTokenVesting | undefined, vestIds: VestId[]) => {
  const [vestTotalAmounts, setVestTotalAmounts] = useState<VestTotalAmount[]>([]);

  useEffect(() => {
    if (vestIds.length === vestTotalAmounts.length) {
      return;
    }

    if (!generalTokenVesting) {
      setVestTotalAmounts([]);
      return;
    }

    Promise.all(vestIds.map(vestId => {
      const vestTotalAmount = vestTotalAmounts.find(p => p.vestId.id === vestId.id);
      if (vestTotalAmount) {
        return Promise.all([vestId, vestTotalAmount.totalAmount]);
      }
      return Promise.all([vestId, generalTokenVesting.getTotalTokens(vestId.token, vestId.beneficiary)]);
    }))
      .then(totalAmountsData => {
        const totalAmounts: VestTotalAmount[] = totalAmountsData.map(([vestId, totalAmount]) => ({
          vestId: vestId,
          totalAmount: totalAmount,
        }));

        setVestTotalAmounts(totalAmounts);
      })
      .catch(console.error);
  }, [generalTokenVesting, vestIds, vestTotalAmounts]);

  return vestTotalAmounts;
}

const useVestPerSeconds = (vestIds: VestId[], vestPeriods: VestPeriod[], vestTotalAmounts: VestTotalAmount[]) => {
  const [vestsPerSecond, setVestsPerSecond] = useState<VestPerSecond[]>([]);

  useEffect(() => {
    const perSecond = vestIds.map(vestId => {
      const vestPeriod = vestPeriods.find(p => p.vestId.id === vestId.id);
      if (!vestPeriod) {
        return undefined;
      }

      let totalAmount = BigNumber.from(0);
      const vestTotalAmount = vestTotalAmounts.find(t => t.vestId.id === vestPeriod.vestId.id);
      if (vestTotalAmount) {
        totalAmount = vestTotalAmount.totalAmount;
      }

      const vestPerSecond: VestPerSecond = {
        vestId: vestPeriod.vestId,
        perSecond: totalAmount.div(vestPeriod.end - vestPeriod.start),
      }

      return vestPerSecond;
    }).filter(v => v !== undefined) as VestPerSecond[];

    setVestsPerSecond(perSecond);
  }, [vestIds, vestPeriods, vestTotalAmounts]);

  return vestsPerSecond;
}

const useVestVestedAmounts = (vestIds: VestId[], vestTotalAmounts: VestTotalAmount[], vestPeriods: VestPeriod[], vestPerSeconds: VestPerSecond[], currentTime: number) => {
  const [vestVestedAmounts, setVestVestedAmounts] = useState<VestVestedAmount[]>([]);

  useEffect(() => {
    const vestedAmounts = vestIds.map(vestId => {
      const vestPeriod = vestPeriods.find(p => p.vestId.id === vestId.id);
      const vestPerSecond = vestPerSeconds.find(v => v.vestId.id === vestId.id);
      const vestTotalAmount = vestTotalAmounts.find(t => t.vestId.id === vestId.id);

      if (!vestPeriod || !vestPerSecond || !vestTotalAmount) {
        return undefined;
      }

      const vestedAmount: VestVestedAmount = {
        vestId: vestId,
        vestedAmount: BigNumber.from(0),
      }

      if (currentTime >= vestPeriod.end) {
        vestedAmount.vestedAmount = vestTotalAmount.totalAmount;
      } else {
        const elapsed = currentTime - vestPeriod.start;
        vestedAmount.vestedAmount = vestPerSecond.perSecond.mul(elapsed);
      }

      return vestedAmount;
    }).filter(v => v !== undefined) as VestVestedAmount[];

    setVestVestedAmounts(vestedAmounts)
  }, [currentTime, vestIds, vestTotalAmounts, vestPerSeconds, vestPeriods]);

  return vestVestedAmounts;
}

const useVestClaimedAmounts = (generalTokenVesting: GeneralTokenVesting | undefined, vestIds: VestId[]) => {
  const [vestClaimedAmounts, setVestClaimedAmounts] = useState<VestClaimedAmount[]>([]);

  useEffect(() => {
    if (vestIds.length === vestClaimedAmounts.length) {
      return;
    }

    if (!generalTokenVesting) {
      setVestClaimedAmounts([]);
      return;
    }

    Promise.all(vestIds.map(vestId => {
      const vestClaimedAmount = vestClaimedAmounts.find(p => p.vestId.id === vestId.id);
      if (vestClaimedAmount) {
        return Promise.all([vestId, vestClaimedAmount.claimedAmount]);
      }
      return Promise.all([vestId, generalTokenVesting.getReleasedTokens(vestId.token, vestId.beneficiary)]);
    }))
      .then(claimedAmountsData => {
        const claimedAmounts: VestClaimedAmount[] = claimedAmountsData.map(([vestId, claimedAmount]) => ({
          vestId: vestId,
          claimedAmount: claimedAmount,
        }));

        setVestClaimedAmounts(claimedAmounts);
      })
      .catch(console.error);
  }, [generalTokenVesting, vestIds, vestClaimedAmounts]);

  useEffect(() => {
    if (!generalTokenVesting) {
      return;
    }

    const tokensReleased = (token: string, beneficiary: string, _: string, amount: BigNumber, __: any) => {
      setVestClaimedAmounts(vestClaimedAmounts => {
        const newVestClaimedAmounts = vestClaimedAmounts.map(vestClaimedAmount => {
          const newVestClaimedAmount = Object.assign({}, vestClaimedAmount);
          if (newVestClaimedAmount.vestId.token === token && newVestClaimedAmount.vestId.beneficiary === beneficiary) {
            newVestClaimedAmount.claimedAmount = newVestClaimedAmount.claimedAmount.add(amount);
          }

          return newVestClaimedAmount;
        });

        return newVestClaimedAmounts;
      });
    }

    const filter = generalTokenVesting.filters.TokensReleased();
    generalTokenVesting.on(filter, tokensReleased);

    return () => {
      generalTokenVesting.off(filter, tokensReleased);
    }
  }, [generalTokenVesting]);

  return vestClaimedAmounts;
}

const useVestClaimableAmounts = (vestIds: VestId[], vestVestedAmounts: VestVestedAmount[], vestClaimedAmounts: VestClaimedAmount[]) => {
  const [vestClaimableAmounts, setVestClaimableAmounts] = useState<VestClaimableAmount[]>([]);

  useEffect(() => {
    const claimableAmounts = vestIds.map(vestId => {
      const vestVestedAmount = vestVestedAmounts.find(v => v.vestId.id === vestId.id)
      const vestClaimedAmount = vestClaimedAmounts.find(r => r.vestId.id === vestId.id);

      if (!vestVestedAmount || !vestClaimedAmount) {
        return undefined;
      }

      const vestClaimableAmount: VestClaimableAmount = {
        vestId: vestVestedAmount.vestId,
        claimableAmount: vestVestedAmount.vestedAmount.sub(vestClaimedAmount.claimedAmount),
      }

      return vestClaimableAmount;
    }).filter(v => v !== undefined) as VestClaimableAmount[];

    setVestClaimableAmounts(claimableAmounts);
  }, [vestIds, vestClaimedAmounts, vestVestedAmounts]);

  return vestClaimableAmounts;
}

const useVestStatuses = (vestIds: VestId[], vestPeriods: VestPeriod[], vestClaimableAmounts: VestClaimableAmount[], currentTime: number) => {
  const [vestStatuses, setVestStatuses] = useState<VestStatus[]>([]);

  useEffect(() => {
    const statuses = vestIds.map(vestId => {
      const vestPeriod = vestPeriods.find(p => p.vestId.id === vestId.id);
      const vestClaimableAmount = vestClaimableAmounts.find(c => c.vestId.id === vestId.id);

      if (!vestPeriod || !vestClaimableAmount) {
        return undefined;
      }

      if (currentTime < vestPeriod.end) {
        return {
          vestId: vestId,
          statusType: VestStatusType.Active,
          statusEmoji: VEST_STATUS_ACTIVE_EMOJI,
          statusDescription: VEST_STATUS_ACTIVE_DESCRIPTION,
        }
      } else {
        if (vestClaimableAmount.claimableAmount.gt(0)) {
          return {
            vestId: vestId,
            statusType: VestStatusType.OverAndClaimable,
            statusEmoji: VEST_STATUS_OVER_AND_CLAIMABLE_EMOJI,
            statusDescription: VEST_STATUS_OVER_AND_CLAIMABLE_DESCRIPTION,
          }
        } else if (vestClaimableAmount.claimableAmount.eq(0)) {
          return {
            vestId: vestId,
            statusType: VestStatusType.Completed,
            statusEmoji: VEST_STATUS_COMPLETED_EMOJI,
            statusDescription: VEST_STATUS_COMPLETED_DESCRIPTION,
          }
        }
      }

      return undefined;
    }).filter(v => v !== undefined) as VestStatus[];

    setVestStatuses(statuses);
  }, [currentTime, vestClaimableAmounts, vestIds, vestPeriods]);

  return vestStatuses;
}

const useAllVests = (
  vestIds: VestId[],
  vestTokens: ERC20Token[],
  vestPeriods: VestPeriod[],
  vestTotalAmounts: VestTotalAmount[],
  vestVestedAmounts: VestVestedAmount[],
  vestClaimedAmounts: VestClaimedAmount[],
  vestClaimableAmounts: VestClaimableAmount[],
  vestStatuses: VestStatus[],
) => {
  const [allVests, setAllVests] = useState<Vest[]>([]);
  const { provider } = useWeb3();

  useEffect(() => {
    if (!provider) {
      setAllVests([]);
      return;
    }

    const vests = vestIds.map(vestId => {
      const vestToken = vestTokens.find(t => t.address === vestId.token);
      if (!vestToken) {
        return undefined;
      }

      const vestPeriod = vestPeriods.find(p => p.vestId.id === vestId.id);
      if (!vestPeriod) {
        return undefined;

      }

      const vestTotalAmount = vestTotalAmounts.find(t => t.vestId.id === vestId.id);
      if (!vestTotalAmount) {
        return undefined;
      }

      const vestVestedAmount = vestVestedAmounts.find(a => a.vestId.id === vestId.id);
      if (!vestVestedAmount) {
        return undefined;
      }

      const vestClaimedAmount = vestClaimedAmounts.find(r => r.vestId.id === vestId.id);
      if (!vestClaimedAmount) {
        return undefined;
      }

      const vestClaimableAmount = vestClaimableAmounts.find(r => r.vestId.id === vestId.id);
      if (!vestClaimableAmount) {
        return undefined;
      }

      const vestStatus = vestStatuses.find(s => s.vestId.id === vestId.id);
      if (!vestStatus) {
        return undefined;
      }

      const vest: Vest = {
        id: vestId.id,
        beneficiary: vestId.beneficiary,
        token: vestToken,
        creator: vestId.creator,
        start: vestPeriod.start,
        end: vestPeriod.end,
        totalAmount: vestTotalAmount.totalAmount,
        vestedAmount: vestVestedAmount.vestedAmount,
        claimedAmount: vestClaimedAmount.claimedAmount,
        claimableAmount: vestClaimableAmount.claimableAmount,
        statusType: vestStatus.statusType,
        statusEmoji: vestStatus.statusEmoji,
        statusDescription: vestStatus.statusDescription,
      };

      return vest;
    }).filter(v => v !== undefined) as Vest[];

    setAllVests(vests);
  }, [vestIds, vestTokens, vestPeriods, vestTotalAmounts, vestVestedAmounts, vestClaimedAmounts, vestClaimableAmounts, vestStatuses, provider]);

  return allVests;
}

const useVestsLoading = (allVestsLoading: boolean) => {
  const [loadingToastId, setLoadingToastId] = useState<React.ReactText>();
  useEffect(() => {
    if (loadingToastId && allVestsLoading) {
      return;
    }

    if (loadingToastId && !allVestsLoading) {
      toast.dismiss(loadingToastId);
      return;
    }

    const toastId = toast.info("Loading", {
      autoClose: false,
      closeOnClick: false,
      draggable: false,
      closeButton: false,
    });

    setLoadingToastId(toastId);
  }, [allVestsLoading, loadingToastId]);
}

export {
  useVestIds,
  useVestsLoading,
  useVestTokens,
  useVestPeriods,
  useVestTotalAmounts,
  useVestPerSeconds,
  useVestVestedAmounts,
  useVestClaimedAmounts,
  useVestClaimableAmounts,
  useVestStatuses,
  useAllVests,
}
