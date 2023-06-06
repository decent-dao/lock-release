// SPDX-License-Identifier: MIT

pragma solidity ^0.8.19;

import "@openzeppelin/contracts-4/utils/math/Math.sol";
import "@openzeppelin/contracts-4/utils/math/SafeCast.sol";

interface Escrow {
    // function getBalance(address _token, address _address, uint _block) external view returns (uint);
}

contract Checkpoints is Escrow {
    struct Checkpoint {
        uint32 fromBlock;
        uint224 votes;
    }

    mapping(address => mapping(address => Checkpoint[])) private _checkpoints;
    mapping(address => Checkpoint[]) private _totalSupplyCheckpoints;

    /**
     * @dev Clock used for flagging checkpoints. Can be overridden to implement timestamp based checkpoints (and voting).
     */
    function clock() public view virtual returns (uint48) {
        return SafeCast.toUint48(block.number);
    }

    /**
     * @dev Get the `pos`-th checkpoint for `account`.
     */
    function checkpoints(address token, address account, uint32 pos) public view virtual returns (Checkpoint memory) {
        return _checkpoints[token][account][pos];
    }

    
    /**
     * @dev Get number of checkpoints for `account`.
     */
    function numCheckpoints(address token, address account) public view virtual returns (uint32) {
        return SafeCast.toUint32(_checkpoints[token][account].length);
    }

    /**
     * @dev Gets the current votes balance for `account`
     */
    function getVotes(address token, address account) public view virtual returns (uint256) {
        uint256 pos = _checkpoints[token][account].length;
        unchecked {
            return pos == 0 ? 0 : _checkpoints[token][account][pos - 1].votes;
        }
    }

    /**
     * @dev Retrieve the number of votes for `account` at the end of `timepoint`.
     *
     * Requirements:
     *
     * - `timepoint` must be in the past
     */
    function getPastVotes(address token, address account, uint256 timepoint) public view virtual returns (uint256) {
        require(timepoint < clock(), "ERC20Votes: future lookup");
        return _checkpointsLookup(_checkpoints[token][account], timepoint);
    }

    /**
     * @dev Retrieve the `totalSupply` at the end of `timepoint`. Note, this value is the sum of all balances.
     * It is NOT the sum of all the delegated votes!
     *
     * Requirements:
     *
     * - `timepoint` must be in the past
     */
    function getPastTotalSupply(address token, uint256 timepoint) public view virtual returns (uint256) {
        require(timepoint < clock(), "ERC20Votes: future lookup");
        return _checkpointsLookup(_totalSupplyCheckpoints[token], timepoint);
    }

    /**
     * @dev Lookup a value in a list of (sorted) checkpoints.
     */
    function _checkpointsLookup(Checkpoint[] storage ckpts, uint256 timepoint) private view returns (uint256) {
        // We run a binary search to look for the last (most recent) checkpoint taken before (or at) `timepoint`.
        //
        // Initially we check if the block is recent to narrow the search range.
        // During the loop, the index of the wanted checkpoint remains in the range [low-1, high).
        // With each iteration, either `low` or `high` is moved towards the middle of the range to maintain the invariant.
        // - If the middle checkpoint is after `timepoint`, we look in [low, mid)
        // - If the middle checkpoint is before or equal to `timepoint`, we look in [mid+1, high)
        // Once we reach a single value (when low == high), we've found the right checkpoint at the index high-1, if not
        // out of bounds (in which case we're looking too far in the past and the result is 0).
        // Note that if the latest checkpoint available is exactly for `timepoint`, we end up with an index that is
        // past the end of the array, so we technically don't find a checkpoint after `timepoint`, but it works out
        // the same.
        uint256 length = ckpts.length;

        uint256 low = 0;
        uint256 high = length;

        if (length > 5) {
            uint256 mid = length - Math.sqrt(length);
            if (_unsafeAccess(ckpts, mid).fromBlock > timepoint) {
                high = mid;
            } else {
                low = mid + 1;
            }
        }

        while (low < high) {
            uint256 mid = Math.average(low, high);
            if (_unsafeAccess(ckpts, mid).fromBlock > timepoint) {
                high = mid;
            } else {
                low = mid + 1;
            }
        }

        unchecked {
            return high == 0 ? 0 : _unsafeAccess(ckpts, high - 1).votes;
        }
    }

    /**
     * @dev Maximum token supply. Defaults to `type(uint224).max` (2^224^ - 1).
     */
    function _maxSupply() internal view virtual returns (uint224) {
        return type(uint224).max;
    }

    /**
     * @dev Snapshots the totalSupply after it has been increased.
     */
    function _mint(address token, uint256 amount) internal virtual {
        _writeCheckpoint(_totalSupplyCheckpoints[token], _add, amount);
    }

    /**
     * @dev Snapshots the totalSupply after it has been decreased.
     */
    function _burn(address token, uint256 amount) internal virtual {
        _writeCheckpoint(_totalSupplyCheckpoints[token], _subtract, amount);
    }

    /**
     * @dev Move voting power when tokens are transferred.
     *
     * Emits a {IVotes-DelegateVotesChanged} event.
     */
    function _afterTokenTransfer(address token, address from, address to, uint256 amount) internal virtual {
        if (from != to && amount > 0) {
            if (from != address(0)) {
                _writeCheckpoint(_checkpoints[token][from], _subtract, amount);
            }

            if (to != address(0)) {
                _writeCheckpoint(_checkpoints[token][to], _add, amount);
            }
        }
    }

    function _writeCheckpoint(
        Checkpoint[] storage ckpts,
        function(uint256, uint256) view returns (uint256) op,
        uint256 delta
    ) private returns (uint256 oldWeight, uint256 newWeight) {
        uint256 pos = ckpts.length;

        unchecked {
            Checkpoint memory oldCkpt = pos == 0 ? Checkpoint(0, 0) : _unsafeAccess(ckpts, pos - 1);

            oldWeight = oldCkpt.votes;
            newWeight = op(oldWeight, delta);

            if (pos > 0 && oldCkpt.fromBlock == clock()) {
                _unsafeAccess(ckpts, pos - 1).votes = SafeCast.toUint224(newWeight);
            } else {
                ckpts.push(Checkpoint({fromBlock: SafeCast.toUint32(clock()), votes: SafeCast.toUint224(newWeight)}));
            }
        }
    }

    function _add(uint256 a, uint256 b) private pure returns (uint256) {
        return a + b;
    }

    function _subtract(uint256 a, uint256 b) private pure returns (uint256) {
        return a - b;
    }

    /**
     * @dev Access an element of the array without performing bounds check. The position is assumed to be within bounds.
     */
    function _unsafeAccess(Checkpoint[] storage ckpts, uint256 pos) private pure returns (Checkpoint storage result) {
        assembly {
            mstore(0, ckpts.slot)
            result.slot := add(keccak256(0, 0x20), pos)
        }
    }
}