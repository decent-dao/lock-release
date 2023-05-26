// SPDX-License-Identifier: MIT

pragma solidity ^0.8.19;

import "@openzeppelin/contracts-4/token/ERC20/utils/SafeERC20.sol";

/// @title LockRelease
/// @dev This contract allows to create token release schedules and to release those tokens.
contract LockRelease {
    using SafeERC20 for IERC20;

    /// @dev Represents a release schedule for a specific beneficiary.
    struct Schedule {
        uint256 total; // total tokens that the beneficiary will receive over the duration
        uint256 released; // already released tokens to the beneficiary
        uint128 start; // start timestamp of the release schedule
        uint128 duration; // duration of the release schedule in seconds
    }

    /// @dev Mapping of token address => beneficiary address => release schedule.
    mapping(address => mapping(address => Schedule)) private _schedules;

    /// @dev Emitted when a release schedule is created.
    event ScheduleStarted(
        address indexed token,
        address indexed beneficiary,
        address indexed creator
    );

    /// @dev Emitted when tokens are released to a recipient.
    event TokensReleased(
        address indexed token,
        address indexed beneficiary,
        address recipient,
        uint256 amount,
        address indexed releasor
    );

    /// @notice Returns the total tokens that will be released to the beneficiary over the duration.
    function getTotal(address token, address beneficiary)
        public
        view
        returns (uint256)
    {
        return _schedules[token][beneficiary].total;
    }

    /// @notice Returns the total tokens already released to the beneficiary.
    function getReleased(address token, address beneficiary)
        public
        view
        returns (uint256)
    {
        return _schedules[token][beneficiary].released;
    }

    /// @notice Returns the start timestamp of the beneficiary's release schedule.
    function getStart(address token, address beneficiary)
        public
        view
        returns (uint256)
    {
        return _schedules[token][beneficiary].start;
    }

    /// @notice Returns the duration of the beneficiary's release schedule.
    function getDuration(address token, address beneficiary)
        public
        view
        returns (uint256)
    {
        return _schedules[token][beneficiary].duration;
    }

    /// @notice Returns the total tokens that have matured until now according to the release schedule.
    function getTotalMatured(address token, address beneficiary)
        public
        view
        returns (uint256)
    {
        Schedule memory schedule = _schedules[token][beneficiary];

        if (block.timestamp < schedule.start) {
            return 0;
        }

        if (block.timestamp >= schedule.start + schedule.duration) {
            return schedule.total;
        }

        return
            (schedule.total * (block.timestamp - schedule.start)) /
            schedule.duration;
    }

    /// @notice Returns the total tokens that can be released now.
    function getReleasable(address token, address beneficiary)
        public
        view
        returns (uint256)
    {
        return
            getTotalMatured(token, beneficiary) -
            getReleased(token, beneficiary);
    }

    /// @notice Creates a release schedule for the given beneficiary.
    function createSchedule(
        address token,
        address beneficiary,
        uint256 total,
        uint128 start,
        uint128 duration
    ) public {
        // Validations
        require(duration > 0, "LockRelease: duration is 0");
        require(
            beneficiary != address(0),
            "LockRelease: beneficiary is the zero address"
        );
        require(
            address(token) != address(0),
            "LockRelease: token is the zero address"
        );
        require(total != 0, "LockRelease: total is zero");
        require(
            _schedules[token][beneficiary].total == 0,
            "LockRelease: Schedule already created for this token => beneficiary"
        );

        // Transfer tokens from sender to contract
        uint256 before = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), total);
        uint256 afterr = IERC20(token).balanceOf(address(this));
        uint256 result = afterr - before;
        require(result != 0, "LockRelease: amount is zero");

        // Save release schedule
        Schedule memory schedule = Schedule(result, 0, start, duration);
        _schedules[token][beneficiary] = schedule;

        emit ScheduleStarted(token, beneficiary, msg.sender);
    }

    /// @dev Internal function to release tokens according to the release schedule.
    function _release(
        address token,
        address beneficiary,
        address recipient,
        uint256 amount
    ) private {
        // Validations
        uint256 unreleased = getReleasable(token, beneficiary);
        require(unreleased > 0, "LockRelease: no tokens are due");
        require(amount > 0, "LockRelease: can't claim 0 tokens");
        require(
            amount <= unreleased,
            "LockRelease: too many tokens being claimed"
        );

        // Update released amount
        _schedules[token][beneficiary].released =
            _schedules[token][beneficiary].released +
            amount;

        // Transfer tokens to recipient
        IERC20(token).safeTransfer(recipient, amount);
        emit TokensReleased(token, beneficiary, recipient, amount, msg.sender);
    }

    /// @notice Release tokens to beneficiary.
    function release(
        address token,
        address beneficiary,
        uint256 amount
    ) public {
        _release(token, beneficiary, beneficiary, amount);
    }

    /// @notice Release all releasable tokens to beneficiary.
    function release(address token, address beneficiary) public {
        release(token, beneficiary, getReleasable(token, beneficiary));
    }

    /// @notice Release tokens to a different recipient.
    function releaseTo(
        address token,
        address recipient,
        uint256 amount
    ) public {
        _release(token, msg.sender, recipient, amount);
    }

    /// @notice Release all releasable tokens to a different recipient.
    function releaseTo(address token, address recipient) public {
        releaseTo(token, recipient, getReleasable(token, msg.sender));
    }
}
