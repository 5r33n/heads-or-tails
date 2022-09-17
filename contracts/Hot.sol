// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol";

error Hot__NotEnoughETHEntered();
error Hot__TransferFailed();
error Hot__NotOpen();
error Hot__UpkeepNotNeeded(uint256 currentBalance, uint256 numPlayers, uint256 hotState);

/** @title Heads or Tails
 * @author Milad Green
 */

contract Hot is VRFConsumerBaseV2, KeeperCompatibleInterface {
    /* Type Declarations */
    enum HotState {
        OPEN,
        CALCULATING
    }
    enum HeadsOrTails {
        HEADS,
        TAILS
    }

    /* State Variable */
    uint256 private immutable i_entranceFee;
    address payable[] private s_players;
    address payable[] private s_headers;
    address payable[] private s_tailers;
    uint256 private s_winAmount;
    uint256 private s_headersBalance = 0;
    uint256 private s_tailersBalance = 0;
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
    bytes32 private immutable i_gasLane;
    uint64 private immutable i_subscriptionId;
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint32 private immutable i_callbackGasLimit;
    uint32 private constant NUM_WORDS = 1;

    /* Lottery Variables (State Variables) */
    HeadsOrTails private s_recentFlip;
    HotState private s_hotState;
    uint256 private s_lastTimeStamp;
    uint256 private immutable i_interval;

    /* Events */
    event HotEnter(address indexed player);
    event RequestedHotWinner(uint256 indexed requestId);
    // event WinnerPicked(address indexed winner);
    event HotResult(uint256 indexed result);

    /* Functions */
    constructor(
        address vrfCoordinatorV2,
        uint256 entranceFee,
        bytes32 gasLane,
        uint64 subscriptionId,
        uint32 callbackGasLimit,
        uint256 interval
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        i_entranceFee = entranceFee;
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        i_gasLane = gasLane;
        i_subscriptionId = subscriptionId;
        i_callbackGasLimit = callbackGasLimit;
        s_hotState = HotState.OPEN; // HotState(0)
        s_lastTimeStamp = block.timestamp;
        i_interval = interval;
    }

    function enterHot(HeadsOrTails choice) public payable {
        if (msg.value < i_entranceFee) {
            revert Hot__NotEnoughETHEntered();
        }

        if (s_hotState != HotState.OPEN) {
            revert Hot__NotOpen();
        }

        bool isHeads = (HeadsOrTails.HEADS == choice);

        if (isHeads) {
            s_headers.push(payable(msg.sender));
            s_headersBalance += msg.value;
        } else {
            s_tailers.push(payable(msg.sender));
            s_tailersBalance += msg.value;
        }

        // s_players.push(payable(msg.sender));

        // Emit an event when we update a dynamic array or mapping
        emit HotEnter(msg.sender);
    }

    /**
     * @dev The following should be true in order to return `upkeepNeeded` as true.
     * 1. Our time interval should've passed.
     * 2. The lottery should have at least 1 player and some ETH.
     * 3. Our subscription is funded with LINK.
     * 4. The lottery should be in an "open" state.
     */
    function checkUpkeep(
        bytes memory /* checkData */
    )
        public
        override
        returns (
            bool upkeepNeeded,
            bytes memory /* performData */
        )
    {
        bool isOpen = (HotState.OPEN == s_hotState);
        bool timePassed = ((block.timestamp - s_lastTimeStamp) > i_interval);
        bool hasPlayers = (s_headers.length + s_tailers.length > 0);
        bool hasBalance = (address(this).balance > 0);
        upkeepNeeded = (isOpen && timePassed && hasPlayers && hasBalance);
    }

    // Pick a random winner with VRFCoordinator
    // 1. Request
    function performUpkeep(
        bytes calldata /* performData */
    ) external override {
        (bool upkeepNeeded, ) = checkUpkeep("");
        if (!upkeepNeeded) {
            revert Hot__UpkeepNotNeeded(
                address(this).balance,
                s_headers.length + s_tailers.length,
                uint256(s_hotState)
            );
        }
        s_hotState = HotState.CALCULATING;
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_gasLane,
            i_subscriptionId,
            REQUEST_CONFIRMATIONS,
            i_callbackGasLimit,
            NUM_WORDS
        );
        emit RequestedHotWinner(requestId);
    }

    // 2. Fulfill
    function fulfillRandomWords(
        uint256, /*requestId*/
        uint256[] memory randomWords
    ) internal override {
        // uint256 indexOfWinner = randomWords[0] % s_players.length;
        uint256 flipResult = randomWords[0] % 2;
        // (flipResult == 0)
        //     ? (s_recentFlip = HeadsOrTails.HEADS)
        //     : (s_recentFlip = HeadsOrTails.TAILS);

        if (flipResult == 0) {
            s_recentFlip = HeadsOrTails.HEADS;
        } else {
            s_recentFlip = HeadsOrTails.TAILS;
        }

        // address payable recentWinner = s_players[indexOfWinner];
        // s_recentFlip = flipResult;
        s_hotState = HotState.OPEN;
        // s_players = new address payable[](0);

        s_lastTimeStamp = block.timestamp;

        uint256 winnerIndex = 0;
        uint256 winnerShare;

        if (s_recentFlip == HeadsOrTails.HEADS) {
            for (winnerIndex = 0; winnerIndex < s_headers.length; winnerIndex++) {
                winnerShare = getWinnerShare(s_headers[winnerIndex].balance, s_recentFlip);
                (bool success, ) = s_headers[winnerIndex].call{value: winnerShare}("");
                // if (!success) {
                //     revert Hot__TransferFailed();
                // }
            }
        } else {
            for (winnerIndex = 0; winnerIndex < s_tailers.length; winnerIndex++) {
                winnerShare = getWinnerShare(s_tailers[winnerIndex].balance, s_recentFlip);
                (bool success, ) = s_tailers[winnerIndex].call{value: winnerShare}("");
                if (!success) {
                    // break;
                    revert Hot__TransferFailed();
                }
            }
        }

        s_headers = new address payable[](0);
        s_tailers = new address payable[](0);
        // (bool success, ) = recentWinner.call{value: address(this).balance}("");
        // if (!success) {
        //     revert Hot__TransferFailed();
        // }
        // emit WinnerPicked(recentWinner);
        emit HotResult(flipResult);
    }

    /* View / Pure functions */

    function getWinnerShare(uint256 betAmount, HeadsOrTails flipResult)
        public
        view
        returns (uint256)
    {
        uint256 winnerShare;
        uint256 winnersTotalBalance;
        uint256 losersTotalBalance;

        if (flipResult == HeadsOrTails.HEADS) {
            winnersTotalBalance = s_headersBalance;
            losersTotalBalance = s_tailersBalance;
        } else {
            winnersTotalBalance = s_tailersBalance;
            losersTotalBalance = s_headersBalance;
        }
        winnerShare =
            (((losersTotalBalance * 10**18) / winnersTotalBalance + 10**18) * betAmount) /
            (10**18);
        return winnerShare;
    }

    function getEntranceFee() public view returns (uint256) {
        return i_entranceFee;
    }

    function getPlayer(uint256 index) public view returns (address) {
        return s_players[index];
    }

    function getHeader(uint256 index) public view returns (address) {
        return s_headers[index];
    }

    function getTailer(uint256 index) public view returns (address) {
        return s_tailers[index];
    }

    function getRecentFlip() public view returns (HeadsOrTails) {
        return s_recentFlip;
    }

    function getHotState() public view returns (HotState) {
        return s_hotState;
    }

    function getNumWords() public pure returns (uint256) {
        return NUM_WORDS;
    }

    function getNumberOfPlayers() public view returns (uint256) {
        // return s_players.length;
        return s_headers.length + s_tailers.length;
    }

    function getLatestTimeStamp() public view returns (uint256) {
        return s_lastTimeStamp;
    }

    function getRequestConfirmations() public pure returns (uint256) {
        return REQUEST_CONFIRMATIONS;
    }

    function getInterval() public view returns (uint256) {
        return i_interval;
    }
}
