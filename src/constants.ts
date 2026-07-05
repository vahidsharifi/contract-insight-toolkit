export const APP_VERSION = "0.1.0";
export const DEFAULT_FUNDING_BNB = "0.004";
export const DEFAULT_RPC_URL = "https://bsc-dataseed.binance.org";
export const BSC_CHAIN_ID = 56;

export const COMMON_BSC = {
  pancakeV2Router: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
  pancakeV2Factory: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73",
  wbnb: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  usdt: "0x55d398326f99059fF775485246999027B3197955",
  busd: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
  usdc: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d"
} as const;

export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function owner() view returns (address)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
  "function transferFrom(address,address,uint256) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)"
];

export const ROUTER_ABI = [
  "function factory() view returns (address)",
  "function WETH() view returns (address)",
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)",
  "function getAmountsIn(uint256 amountOut, address[] path) view returns (uint256[] amounts)",
  "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable",
  "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)"
];

export const FACTORY_ABI = [
  "function getPair(address tokenA, address tokenB) view returns (address)",
  "function createPair(address tokenA, address tokenB) returns (address)"
];

export const PAIR_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function totalSupply() view returns (uint256)",
  "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
  "event Sync(uint112 reserve0, uint112 reserve1)"
];

export const KNOWN_SELECTORS: Record<string, { signature: string; classification: string }> = {
  "0x06fdde03": { signature: "name()", classification: "standard ERC-20" },
  "0x095ea7b3": { signature: "approve(address,uint256)", classification: "standard ERC-20" },
  "0x18160ddd": { signature: "totalSupply()", classification: "standard ERC-20" },
  "0x23b872dd": { signature: "transferFrom(address,address,uint256)", classification: "standard ERC-20" },
  "0x313ce567": { signature: "decimals()", classification: "standard ERC-20" },
  "0x70a08231": { signature: "balanceOf(address)", classification: "standard ERC-20" },
  "0x715018a6": { signature: "renounceOwnership()", classification: "owner-only admin function" },
  "0x8da5cb5b": { signature: "owner()", classification: "read-only config getter" },
  "0x95d89b41": { signature: "symbol()", classification: "standard ERC-20" },
  "0xa9059cbb": { signature: "transfer(address,uint256)", classification: "standard ERC-20" },
  "0xdd62ed3e": { signature: "allowance(address,address)", classification: "standard ERC-20" },
  "0xf2fde38b": { signature: "transferOwnership(address)", classification: "owner-only admin function" },
  "0x07131087": { signature: "unknown()", classification: "unknown dangerous function" },
  "0x0c545855": { signature: "unknown()", classification: "unknown dangerous function" },
  "0x1178df00": { signature: "unknown()", classification: "unknown dangerous function" },
  "0x1375ed74": { signature: "unknown()", classification: "unknown dangerous function" },
  "0x153b0d1e": { signature: "unknown()", classification: "unknown dangerous function" },
  "0x1fb17b79": { signature: "unknown()", classification: "unknown dangerous function" },
  "0x39a32520": { signature: "unknown()", classification: "unknown dangerous function" },
  "0x3abc97e5": { signature: "unknown()", classification: "unknown dangerous function" },
  "0x3af32abf": { signature: "unknown()", classification: "unknown dangerous function" },
  "0x44337ea1": { signature: "unknown()", classification: "unknown dangerous function" },
  "0x52f1edcc": { signature: "unknown()", classification: "unknown dangerous function" },
  "0x537df3b6": { signature: "unknown()", classification: "unknown dangerous function" },
  "0x53d6fd59": { signature: "unknown()", classification: "unknown dangerous function" },
  "0x735de9f7": { signature: "unknown()", classification: "unknown dangerous function" },
  "0x8401f8d1": { signature: "unknown()", classification: "unknown dangerous function" },
  "0x8ab1d681": { signature: "unknown()", classification: "unknown dangerous function" },
  "0x9473d48e": { signature: "unknown()", classification: "unknown dangerous function" },
  "0x9a7a23d6": { signature: "unknown()", classification: "unknown dangerous function" },
  "0x9b19251a": { signature: "unknown()", classification: "unknown dangerous function" },
  "0x9d58c972": { signature: "unknown()", classification: "unknown dangerous function" },
  "0xa3b3b808": { signature: "unknown()", classification: "unknown dangerous function" },
  "0xa58da0be": { signature: "unknown()", classification: "unknown dangerous function" },
  "0xa8568769": { signature: "unknown()", classification: "unknown dangerous function" },
  "0xb3406307": { signature: "unknown()", classification: "unknown dangerous function" },
  "0xb62496f5": { signature: "unknown()", classification: "unknown dangerous function" },
  "0xc816841b": { signature: "unknown()", classification: "unknown dangerous function" },
  "0xcd3b691c": { signature: "unknown()", classification: "unknown dangerous function" },
  "0xd5aed6bf": { signature: "unknown()", classification: "unknown dangerous function" },
  "0xe036aa4b": { signature: "unknown()", classification: "unknown dangerous function" },
  "0xe37ff45c": { signature: "unknown()", classification: "unknown dangerous function" },
  "0xe43252d7": { signature: "unknown()", classification: "unknown dangerous function" },
  "0xf9f92be4": { signature: "unknown()", classification: "unknown dangerous function" },
  "0xfe575a87": { signature: "unknown()", classification: "unknown dangerous function" }
};

export const READABLE_GETTER_CANDIDATES = [
  "function uniswapV2Router() view returns (address)",
  "function pancakeRouter() view returns (address)",
  "function router() view returns (address)",
  "function uniswapV2Pair() view returns (address)",
  "function pair() view returns (address)",
  "function factory() view returns (address)",
  "function tradingOpen() view returns (bool)",
  "function tradingEnabled() view returns (bool)",
  "function swapEnabled() view returns (bool)",
  "function limitsInEffect() view returns (bool)",
  "function maxTransactionAmount() view returns (uint256)",
  "function maxTxAmount() view returns (uint256)",
  "function _maxTxAmount() view returns (uint256)",
  "function maxWallet() view returns (uint256)",
  "function maxWalletAmount() view returns (uint256)",
  "function _maxWalletSize() view returns (uint256)",
  "function sellLimit() view returns (uint256)",
  "function maxSellAmount() view returns (uint256)",
  "function buyLimit() view returns (uint256)",
  "function maxBuyAmount() view returns (uint256)"
];

export const ADDRESS_STATUS_GETTER_CANDIDATES = [
  "function isBlacklisted(address) view returns (bool)",
  "function blacklist(address) view returns (bool)",
  "function _isBlacklisted(address) view returns (bool)",
  "function isWhitelisted(address) view returns (bool)",
  "function whitelist(address) view returns (bool)",
  "function isExcludedFromFee(address) view returns (bool)",
  "function _isExcludedFromFee(address) view returns (bool)",
  "function isExcludedFromMaxTransaction(address) view returns (bool)",
  "function automatedMarketMakerPairs(address) view returns (bool)",
  "function ammPairs(address) view returns (bool)"
];
