// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.13;

interface IExampleOracleSimple {
    function consult(address token, uint256 amountIn)
        external
        view
        returns (uint256 amountOut);
}
