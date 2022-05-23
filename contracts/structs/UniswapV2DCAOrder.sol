// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.13;

struct UniswapV2DCAOrder {
    address owner;
    address beneficiary;
    address outputToken;
    uint256 epochAmount;
    uint256 maxRelayerFee;
    uint256 salt;
    uint256 epoch;
    uint256 expiryDate;
    address[] path;
}
