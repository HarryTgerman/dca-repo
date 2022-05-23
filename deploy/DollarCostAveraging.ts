import { deployments, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getAddressBookByNetwork } from "../config";
import { DeployFunction } from "hardhat-deploy/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  //  const {deployments, getNamedAccounts} = hre;

  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const { factory, initCodeHash, WETH } = getAddressBookByNetwork(
    hre.network.name
  );

  await deploy("DollarCostAveraging", {
    from: deployer,
    args: [WETH, factory, initCodeHash],
    log: hre.network.name !== "hardhat" ? true : false,
  });
};

export default func;

func.tags = ["DollarCostAveraging"];
