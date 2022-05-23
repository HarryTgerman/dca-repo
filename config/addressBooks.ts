// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const getAddressBookByNetwork = (network: string) => {
  switch (network) {
    case "rinkeby":
      return {
        factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
        dai: "0xc7AD46e0b8a400Bb3C915120d284AafbA8fc4735",
        maker: "0xF9bA5210F91D0474bd1e1DcDAeC4C58E359AaD85",
        initCodeHash:
          "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f",
        WETH: "0xc778417E063141139Fce010982780140Aa0cD5Ab",
        ETH: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
      };
    case "hardhat":
      return {
        factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
        dai: "0xc7AD46e0b8a400Bb3C915120d284AafbA8fc4735",
        maker: "0xF9bA5210F91D0474bd1e1DcDAeC4C58E359AaD85",
        initCodeHash:
          "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f",
        WETH: "0xc778417E063141139Fce010982780140Aa0cD5Ab",
        ETH: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
      };

    default: {
      throw new Error(`addressBooks: network: ${network} not supported`);
    }
  }
};
