//SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.13;

import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {UniswapV2Library} from "./lib/UniswapV2Library.sol";
import {IWETH} from "./interfaces/IWETH.sol";
import {
    IUniswapV2Pair
} from "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import {IExampleOracleSimple} from "./interfaces/IExampleOracleSimple.sol";

contract DollarCostAveragingAtTWAP {
    address public immutable WRAPPED_NATIVE; 
    address public immutable FACTORY_ADDRESS; 
    address public immutable ORACLE_ADDRESS;
    bytes32 public immutable INIT_CODE_HASH;

    // hashed orders
    mapping(bytes32 => uint256) public orderValue;
    mapping(bytes32 => uint256) private orderUpdatedAt;

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

    event LogDeposit(
        bytes32 indexed key,
        UniswapV2DCAOrder order,
        uint256 amountIn
    );

    event LogFill(
        bytes32 indexed key,
        address indexed beneficiary,
        uint256 amount
    );

    event LogCancelled(
        bytes32 indexed key,
        address indexed owner,
        uint256 amount
    );

    constructor(address _wrappedNative, address _factory, address _oracleAddress, bytes32 _initCodeHash) {
        WRAPPED_NATIVE = _wrappedNative;
        FACTORY_ADDRESS = _factory;
        INIT_CODE_HASH = _initCodeHash;
        ORACLE_ADDRESS = _oracleAddress;
    }


    function depositOrder(UniswapV2DCAOrder calldata _order)
        external
        payable
    {
        require(msg.value != 0, "DollarCostAveraging.depositNativeOrder: VALUE_IS_0");
        require(_order.exiryDate > msg.date, "DollarCostAveraging.depositNativeOrder: ORDER_EXPIRED");
        require(address(_order.beneficiary), "DollarCostAveraging.depositNativeOrder: BENEFICIARY_ADDRESS");
        require(address(_order.owner), "DollarCostAveraging.depositNativeOrder: OWNER_ADDRESS");

        bytes32 key = keyOf(_order);
        require(
            !isActiveOrder(key),
            "DollarCostAveraging.depositNativeOrder: ORDER_ALREADY_EXSITS"
        );

        orderValue[key] = msg.value;
        orderUpdatedAt[key] = now;
        emit LogDeposit(key, _order, msg.value);
    }

    function cancelOrder(UniswapV2DCAOrder calldata _order)
        external
    {
        require(
            msg.sender == _order.owner,
            "DollarCostAveraging.cancelOrder: INVALID_OWNER"
        );
        bytes32 key = keyOf(_order);
        require(
            isActiveOrder(key),
            "DollarCostAveraging.cancelOrder: INVALID_ORDER"
        );

        amount = orderValue[key];
        delete orderValue[key];
        delete orderUpdatedAt[key];
        (bool success, ) = _order.owner.call{value: amount}("");
        require(
            success,
            "DollarCostAveraging.cancelOrder: SEND_NATIVE_FAILED"
        );
        
        emit LogCancelled(key, _order.owner, amount);
    }

    function fill(UniswapV2DCAOrder calldata _order, uint256 _fee)
        internal
    {
        // implements Checks Effects Interactions pattern and thus is reentrancy protected
        bytes32 key = keyOf(_order);
        require(
            isActiveOrder(key),
            "GelatoOrdersVault.fill: INVALID_ORDER"
        );

        uint256 amount = orderValue[key];
        require(
            _order.maxRelayerFee > fee,
            "GelatoOrdersVault.fill: FEE_TO_HIGH"
        );
        require(
            amount > fee,
            "GelatoOrdersVault.fill: NOT_ENOUGH_FUNDS"
        );
        require(
            (now - _order.epoch) > orderUpdatedAt[key],
            "GelatoOrdersVault.fill: EPOCH"
        );

        uint256 DCAAmount;
        address pairAddress;
        address path = _order.path.lenght == 0 ? [WRAPPED_NATIVE, _order.outputToken] :  _order.path;
        uint[] amounts;

        if(amount > (fee + _order.epochAmount)) {
            DCAAmount = _order.epochAmount;
            orderValue[key] = amount - (fee + DCAAmount);
            orderUpdatedAt[key] = now;

            amounts = UniswapV2Library.getAmountsOut(FACTORY_ADDRESS, DCAAmount, path, INIT_CODE_HASH);
            require(amounts[amounts.length-1] >= IExampleOracleSimple(ORACLE_ADDRESS).consult(_order.outputToken, DCAAmount), "AMOUNT_OUT_LESS_THAN_TWAP");

            IWETH(WRAPPED_NATIVE).deposit{value: DCAAmount}();
            SafeERC20.safeTransfer(IERC20(WRAPPED_NATIVE), UniswapV2Library.pairFor(FACTORY_ADDRESS, WRAPPED_NATIVE, _order.outputToken, INIT_CODE_HASH), DCAAmount);

            _swap(amounts, path, _order.beneficiary, FACTORY_ADDRESS, INIT_CODE_HASH);
        }else {
            delete orderValue[key];
            delete orderUpdatedAt[key];

            DCAAmount = amount - fee;

            amounts = UniswapV2Library.getAmountsOut(FACTORY_ADDRESS, DCAAmount, path, INIT_CODE_HASH);
            require(amounts[amounts.length-1] >= IExampleOracleSimple(ORACLE_ADDRESS).consult(_order.outputToken, DCAAmount), "AMOUNT_OUT_LESS_THAN_TWAP");

            IWETH(WRAPPED_NATIVE).deposit{value: amount - fee}();
            SafeERC20.safeTransfer(IERC20(WRAPPED_NATIVE), UniswapV2Library.pairFor(FACTORY_ADDRESS, WRAPPED_NATIVE, _order.outputToken, INIT_CODE_HASH), DCAAmount);
        
           _swap(amounts, path, _order.beneficiary, FACTORY_ADDRESS, INIT_CODE_HASH);
        }

        (bool success, ) = msg.sender.call{value: fee}("");
         require(
            success,
            "DollarCostAveraging.fill: SEND_NATIVE_TO_RALAYER_FAILED"
        );
        emit LogFill(
            key,
            _order.beneficiary,
            DCAAmount
        );
    }

     // **** SWAP ****
    // requires the initial amount to have already been sent to the first pair
    // Original work by Uniswap
    // - https://github.com/Uniswap/v2-periphery/blob/2efa12e0f2d808d9b49737927f0e416fafa5af68/contracts/UniswapV2Router02.sol#L212-L223
    // modified function interface to be able to parse generic factory and initCodeHash
     function _swap(uint[] memory amounts, address[] memory path, address _to,  address _factory, bytes32 _initCodeHash) internal virtual {
        for (uint i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0,) = UniswapV2Library.sortTokens(input, output);
            uint amountOut = amounts[i + 1];
            (uint amount0Out, uint amount1Out) = input == token0 ? (uint(0), amountOut) : (amountOut, uint(0));
            address to = i < path.length - 2 ? UniswapV2Library.pairFor(_factory, output, path[i + 2], _initCodeHash) : _to;
            IUniswapV2Pair(UniswapV2Library.pairFor(_factory, input, output, _initCodeHash)).swap(
                amount0Out, amount1Out, to, new bytes(0)
            );
        }
    }


    function keyOf(UniswapV2DCAOrder calldata _order)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(_order));
    }


    function isActiveOrder(bytes32 _key) public view returns (bool) {
        return orderValue[_key] != 0;
    }
   
}
