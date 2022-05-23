import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import hre, { ethers, deployments } from "hardhat";
import { DollarCostAveraging } from "../typechain";
import { getAddressBookByNetwork } from "../config";
import { BigNumber, BytesLike, BigNumberish } from "ethers";
import { parseEther, parseUnits } from "ethers/lib/utils";

describe("DollarCostAveraging", function () {
  let dollarCostAveraging: DollarCostAveraging;
  let relayer: SignerWithAddress;
  let orderCreator: SignerWithAddress;
  let beneficiary: SignerWithAddress;
  let uniswapV2DCAOrder: {
    owner: string;
    beneficiary: string;
    outputToken: string;
    epochAmount: BigNumberish;
    maxRelayerFee: BigNumber;
    salt: BigNumberish;
    epoch: BigNumber;
    expiryDate: BigNumberish;
    path: string[];
  };

  const inputAmount = parseUnits("100", "ether");

  if (hre.network.name !== "hardhat") {
    console.error("Test Suite is meant to be run on hardhat only");
    process.exit(1);
  }

  // <--------------------- IMPORTANT ---------------------->
  // forking rinkeby => addressBook config for hardhat is polygon config

  beforeEach(async () => {
    await deployments.fixture(["DollarCostAveraging"]);
    [relayer, orderCreator, beneficiary] = await ethers.getSigners();

    const { WETH, dai, maker } = getAddressBookByNetwork(hre.network.name);

    const today = new Date();
    const mseconds = today.getTime();
    // divided to get the just seconds
    const seconds = Math.floor(mseconds / 1000);
    const offset24h = seconds + 86400;

    dollarCostAveraging = await ethers.getContract("DollarCostAveraging");
    uniswapV2DCAOrder = {
      owner: orderCreator.address,
      beneficiary: beneficiary.address,
      outputToken: dai,
      epochAmount: parseUnits("1", "ether"),
      maxRelayerFee: BigNumber.from(parseUnits("0.1", "ether")),
      salt: BigNumber.from("1"),
      epoch: BigNumber.from("3600"),
      expiryDate: BigNumber.from(offset24h),
      path: [WETH, dai],
    };
  });

  describe("Order Submission", function () {
    it("Order Should revert If no value send", async () => {
      await expect(
        dollarCostAveraging
          .connect(orderCreator)
          .depositOrder(uniswapV2DCAOrder, {
            value: parseEther("0"),
          })
      ).to.be.revertedWith("DollarCostAveraging.depositOrder: VALUE_IS_0");
    });

    it("Order Should revert if order already exists", async () => {
      await dollarCostAveraging
        .connect(orderCreator)
        .depositOrder(uniswapV2DCAOrder, { value: inputAmount });

      await expect(
        dollarCostAveraging
          .connect(orderCreator)
          .depositOrder(uniswapV2DCAOrder, { value: inputAmount })
      ).to.be.revertedWith(
        "DollarCostAveraging.depositOrder: ORDER_ALREADY_EXSITS"
      );
    });

    it("Order deposit success", async () => {
      await expect(
        dollarCostAveraging
          .connect(orderCreator)
          .depositOrder(uniswapV2DCAOrder, { value: inputAmount })
      ).to.emit(dollarCostAveraging, "LogDeposit");
    });
  });

  describe("Order Cancellation", function () {
    beforeEach(async () => {
      await dollarCostAveraging
        .connect(orderCreator)
        .depositOrder(uniswapV2DCAOrder, {
          value: inputAmount,
        });
    });

    it("Should emit LogCancelled event on order cancellation", async () => {
      const balanceBefore = await orderCreator.getBalance();
      await expect(
        dollarCostAveraging.connect(orderCreator).cancelOrder(uniswapV2DCAOrder)
      ).to.emit(dollarCostAveraging, "LogCancelled");

      expect((await orderCreator.getBalance()).gt(balanceBefore)).to.eq(true);
    });

    it("Sould revert on not existing order", async () => {
      uniswapV2DCAOrder.salt = BigNumber.from("2");
      await expect(
        dollarCostAveraging.connect(orderCreator).cancelOrder(uniswapV2DCAOrder)
      ).to.be.revertedWith("DollarCostAveraging.cancelOrder: INVALID_ORDER");
    });

    it("Sould revert on wrong owner", async () => {
      await expect(
        dollarCostAveraging.connect(beneficiary).cancelOrder(uniswapV2DCAOrder)
      ).to.be.revertedWith("DollarCostAveraging.cancelOrder: INVALID_OWNER");
    });
  });

  describe("Order Fill", function () {
    beforeEach(async () => {
      await dollarCostAveraging
        .connect(orderCreator)
        .depositOrder(uniswapV2DCAOrder, {
          value: inputAmount,
        });
    });

    it("Sould emit LogFill event on order Fill", async () => {
      await hre.network.provider.send("evm_increaseTime", [3601]);
      const balanceBefore = await beneficiary.getBalance();
      const balanceBeforeRelayer = await relayer.getBalance();

      await expect(
        dollarCostAveraging
          .connect(relayer)
          .fill(
            uniswapV2DCAOrder,
            uniswapV2DCAOrder.maxRelayerFee.sub(BigNumber.from("1"))
          )
      ).to.emit(dollarCostAveraging, "LogFill");

      expect((await beneficiary.getBalance()).gt(balanceBefore)).to.eq(true);
      expect((await relayer.getBalance()).gt(balanceBeforeRelayer)).to.eq(true);
    });

    it("Sould fail if fill before interval threshold", async () => {
      await hre.network.provider.send("evm_increaseTime", [1]);
      await expect(
        dollarCostAveraging
          .connect(relayer)
          .fill(
            uniswapV2DCAOrder,
            uniswapV2DCAOrder.maxRelayerFee.sub(BigNumber.from("1"))
          )
      ).to.be.revertedWith("DollarCostAveraging.fill: EPOCH");
    });

    it("Sould fail if relayerFee to high", async () => {
      await hre.network.provider.send("evm_increaseTime", [3601]);

      await expect(
        dollarCostAveraging
          .connect(relayer)
          .fill(
            uniswapV2DCAOrder,
            uniswapV2DCAOrder.maxRelayerFee.add(BigNumber.from("1"))
          )
      ).to.be.revertedWith("DollarCostAveraging.fill: FEE_TO_HIGH");
    });

    it("Sould fail if not enough funds to pay for relayer fee", async () => {
      uniswapV2DCAOrder.maxRelayerFee = BigNumber.from(
        parseUnits("102", "ether")
      );
      await dollarCostAveraging
        .connect(orderCreator)
        .depositOrder(uniswapV2DCAOrder, {
          value: inputAmount,
        });

      await hre.network.provider.send("evm_increaseTime", [3601]);
      // input Amount is 100 ether, maxFee was set to 101 to simulate maxFee being bigger than current funds
      await expect(
        dollarCostAveraging
          .connect(relayer)
          .fill(uniswapV2DCAOrder, parseUnits("101", "ether"))
      ).to.be.revertedWith("DollarCostAveraging.fill: NOT_ENOUGH_FUNDS");
    });

    it("Sould fail if does not exist", async () => {
      uniswapV2DCAOrder.salt = BigNumber.from("20");
      await expect(
        dollarCostAveraging
          .connect(relayer)
          .fill(uniswapV2DCAOrder, inputAmount.add(BigNumber.from("1")))
      ).to.be.revertedWith("DollarCostAveraging.fill: INVALID_ORDER");
    });
  });
});
