import type { BoardType, HighDividendInfo, MarketExchange, StockSearchItem } from '../shared/quantTypes.ts';

export interface DividendPoolEntry {
  code: string;
  name: string;
  sector: string;
  pinyin: string;
  ttmDividendPerShare: number;
  targetDividendYield: number; // %
  payoutNote: string;
}

export const HIGH_DIVIDEND_POOL: DividendPoolEntry[] = [
  {
    code: '601088',
    name: '中国神华',
    sector: '煤炭开采',
    pinyin: 'zgsh',
    ttmDividendPerShare: 2.26,
    targetDividendYield: 5.0,
    payoutNote: '高分红煤炭龙头，年度分红率持续超过 70%',
  },
  {
    code: '600900',
    name: '长江电力',
    sector: '水力发电',
    pinyin: 'cjdl',
    ttmDividendPerShare: 0.94,
    targetDividendYield: 3.6,
    payoutNote: '水电现金牛，梯级电站分红承诺明确',
  },
  {
    code: '600036',
    name: '招商银行',
    sector: '股份制银行',
    pinyin: 'zsyh',
    ttmDividendPerShare: 2.0,
    targetDividendYield: 5.2,
    payoutNote: '零售银行标杆，现金分红比例维持 35% 以上',
  },
  {
    code: '601398',
    name: '工商银行',
    sector: '国有大型银行',
    pinyin: 'gsyh',
    ttmDividendPerShare: 0.308,
    targetDividendYield: 5.2,
    payoutNote: '国有大行压舱石，中期+末期稳定派息',
  },
  {
    code: '601939',
    name: '建设银行',
    sector: '国有大型银行',
    pinyin: 'jsyh',
    ttmDividendPerShare: 0.403,
    targetDividendYield: 5.2,
    payoutNote: '股息稳定，具备中期分红机制',
  },
  {
    code: '600938',
    name: '中国海油',
    sector: '油气开采',
    pinyin: 'zghy',
    ttmDividendPerShare: 1.4,
    targetDividendYield: 5.2,
    payoutNote: '低桶油成本优势突出，港A同步高派息',
  },
  {
    code: '601857',
    name: '中国石油',
    sector: '石油石化',
    pinyin: 'zgsy',
    ttmDividendPerShare: 0.47,
    targetDividendYield: 5.2,
    payoutNote: '自由现金流充沛，分红回报率稳步提升',
  },
  {
    code: '601225',
    name: '陕西煤业',
    sector: '煤炭开采',
    pinyin: 'sxmy',
    ttmDividendPerShare: 1.31,
    targetDividendYield: 5.5,
    payoutNote: '优质动力煤产区龙头，分红弹性高',
  },
  {
    code: '000651',
    name: '格力电器',
    sector: '白色家电',
    pinyin: 'gldq',
    ttmDividendPerShare: 2.38,
    targetDividendYield: 5.5,
    payoutNote: '高股息现金奶牛，估值低位具备安全垫',
  },
  {
    code: '000333',
    name: '美的集团',
    sector: '白色家电',
    pinyin: 'mdjt',
    ttmDividendPerShare: 3.5,
    targetDividendYield: 4.5,
    payoutNote: '全球化家电龙头，分红率持续提升至 60%+',
  },
  {
    code: '600887',
    name: '伊利股份',
    sector: '乳制品',
    pinyin: 'ylgf',
    ttmDividendPerShare: 1.22,
    targetDividendYield: 4.5,
    payoutNote: '乳业龙头分红率超 70%，现金流稳健',
  },
  {
    code: '600585',
    name: '海螺水泥',
    sector: '水泥建材',
    pinyin: 'hlsn',
    ttmDividendPerShare: 0.96,
    targetDividendYield: 4.2,
    payoutNote: '净现金充裕，逆周期分红能力强',
  },
  {
    code: '600377',
    name: '宁沪高速',
    sector: '高速公路',
    pinyin: 'nhgs',
    ttmDividendPerShare: 0.49,
    targetDividendYield: 4.0,
    payoutNote: '优质路产现金流稳定，连续多年稳定派息',
  },
  {
    code: '000429',
    name: '粤高速A',
    sector: '高速公路',
    pinyin: 'ygsa',
    ttmDividendPerShare: 0.547,
    targetDividendYield: 4.8,
    payoutNote: '高分红承诺 70%，防御属性突出',
  },
  {
    code: '601668',
    name: '中国建筑',
    sector: '基建工程',
    pinyin: 'zgjz',
    ttmDividendPerShare: 0.271,
    targetDividendYield: 4.8,
    payoutNote: '低估值央企基建龙头，股息率稳健',
  },
  {
    code: '600019',
    name: '宝钢股份',
    sector: '钢铁',
    pinyin: 'bggf',
    ttmDividendPerShare: 0.22,
    targetDividendYield: 4.2,
    payoutNote: '高端板材龙头，坚持不低于 50% 分红比例',
  },
];

export const DIVIDEND_MAP = new Map<string, DividendPoolEntry>(
  HIGH_DIVIDEND_POOL.map((item) => [item.code, item]),
);

export const LOCAL_STOCK_DICTIONARY: Array<{
  code: string;
  name: string;
  pinyin: string;
  sector: string;
}> = [
  ...HIGH_DIVIDEND_POOL.map((d) => ({
    code: d.code,
    name: d.name,
    pinyin: d.pinyin,
    sector: d.sector,
  })),
  { code: '600519', name: '贵州茅台', pinyin: 'gzmt', sector: '白酒' },
  { code: '002594', name: '比亚迪', pinyin: 'byd', sector: '新能源汽车' },
  { code: '300750', name: '宁德时代', pinyin: 'ndsd', sector: '动力电池' },
  { code: '601318', name: '中国平安', pinyin: 'zgpa', sector: '保险' },
  { code: '000858', name: '五粮液', pinyin: 'wly', sector: '白酒' },
  { code: '600030', name: '中信证券', pinyin: 'zxzq', sector: '证券' },
  { code: '600276', name: '恒瑞医药', pinyin: 'hryy', sector: '创新药' },
  { code: '000001', name: '平安银行', pinyin: 'payh', sector: '股份制银行' },
  { code: '601166', name: '兴业银行', pinyin: 'xyyh', sector: '股份制银行' },
  { code: '601328', name: '交通银行', pinyin: 'jtyh', sector: '国有大型银行' },
  { code: '601288', name: '农业银行', pinyin: 'nyyh', sector: '国有大型银行' },
  { code: '601988', name: '中国银行', pinyin: 'zgyh', sector: '国有大型银行' },
  { code: '600028', name: '中国石化', pinyin: 'zgsh', sector: '石油石化' },
  { code: '601899', name: '紫金矿业', pinyin: 'zjky', sector: '有色金属' },
  { code: '600309', name: '万华化学', pinyin: 'whhx', sector: '基础化工' },
  { code: '002415', name: '海康威视', pinyin: 'hkws', sector: '安防电子' },
  { code: '603259', name: '药明康德', pinyin: 'ymkd', sector: 'CXO医药外包' },
  { code: '300059', name: '东方财富', pinyin: 'dfcf', sector: '互联网金融' },
  { code: '300760', name: '迈瑞医疗', pinyin: 'mryl', sector: '医疗器械' },
  { code: '688981', name: '中芯国际', pinyin: 'zxgj', sector: '半导体晶圆' },
  { code: '688012', name: '中微公司', pinyin: 'zwgs', sector: '半导体设备' },
  { code: '688111', name: '金山办公', pinyin: 'jsbg', sector: '基础软件' },
  { code: '688041', name: '海光信息', pinyin: 'hgxx', sector: '算力芯片' },
  { code: '688256', name: '寒武纪', pinyin: 'hwj', sector: 'AI芯片' },
  { code: '002371', name: '北方华创', pinyin: 'bfhc', sector: '半导体设备' },
  { code: '601138', name: '工业富联', pinyin: 'gyfl', sector: 'AI服务器' },
  { code: '300308', name: '中际旭创', pinyin: 'zjxc', sector: '光模块' },
  { code: '002475', name: '立讯精密', pinyin: 'lxjm', sector: '消费电子' },
  { code: '600941', name: '中国移动', pinyin: 'zgyd', sector: '通信运营商' },
  { code: '601728', name: '中国电信', pinyin: 'zgdx', sector: '通信运营商' },
  { code: '600050', name: '中国联通', pinyin: 'zglt', sector: '通信运营商' },
  { code: '601919', name: '中远海控', pinyin: 'zyhk', sector: '航运港口' },
  { code: '600809', name: '山西汾酒', pinyin: 'sxfj', sector: '白酒' },
  { code: '000568', name: '泸州老窖', pinyin: 'lzlj', sector: '白酒' },
  { code: '601888', name: '中国中免', pinyin: 'zgzm', sector: '免税零售' },
  { code: '002230', name: '科大讯飞', pinyin: 'kdxf', sector: '人工智能' },
  { code: '603501', name: '韦尔股份', pinyin: 'wegf', sector: '半导体设计' },
  { code: '300124', name: '汇川技术', pinyin: 'hcjs', sector: '工业自动化' },
  { code: '600406', name: '国电南瑞', pinyin: 'gdnr', sector: '电网设备' },
  { code: '601012', name: '隆基绿能', pinyin: 'ljln', sector: '光伏设备' },
  { code: '300274', name: '阳光电源', pinyin: 'ygdy', sector: '光伏逆变器' },
  { code: '002714', name: '牧原股份', pinyin: 'mygf', sector: '生猪养殖' },
  { code: '600436', name: '片仔癀', pinyin: 'pzh', sector: '中药' },
  { code: '000538', name: '云南白药', pinyin: 'ynby', sector: '中药' },
  { code: '601601', name: '中国太保', pinyin: 'zgtb', sector: '保险' },
  { code: '601628', name: '中国人寿', pinyin: 'zgrs', sector: '保险' },
  { code: '832982', name: '锦波生物', pinyin: 'jbsw', sector: '生物医药(北交所)' },
  { code: '920185', name: '贝特瑞', pinyin: 'btr', sector: '锂电负极(北交所)' },
  { code: '835185', name: '贝特瑞(旧)', pinyin: 'btr', sector: '北交所材料' },
  { code: '430047', name: '诺思兰德', pinyin: 'nsld', sector: '生物医药(北交所)' },
  { code: '830799', name: '艾融软件', pinyin: 'arrj', sector: '金融IT(北交所)' },
  { code: '839790', name: '联迪信息', pinyin: 'ldxx', sector: '软件服务(北交所)' },
];

export const DICTIONARY_BY_CODE = new Map(LOCAL_STOCK_DICTIONARY.map((s) => [s.code, s]));

export function inferBoardAndExchange(code: string): {
  market: MarketExchange;
  board: BoardType;
} | null {
  if (!/^\d{6}$/.test(code)) return null;
  if (code.startsWith('68')) {
    return { market: 'sh', board: '科创板' };
  }
  if (code.startsWith('60')) {
    return { market: 'sh', board: '沪A主板' };
  }
  if (code.startsWith('30')) {
    return { market: 'sz', board: '创业板' };
  }
  if (code.startsWith('00')) {
    return { market: 'sz', board: '深A主板' };
  }
  if (code.startsWith('8') || code.startsWith('4') || code.startsWith('92')) {
    return { market: 'bj', board: '北交所' };
  }
  return null;
}

export function isAShareStockCode(code: string): boolean {
  return inferBoardAndExchange(code) !== null;
}

export function computeHighDividendInfo(code: string, currentPrice: number): HighDividendInfo | null {
  const entry = DIVIDEND_MAP.get(code);
  if (!entry || currentPrice <= 0) return null;

  const currentYield = Math.round(((entry.ttmDividendPerShare / currentPrice) * 100) * 100) / 100;
  const targetBuyPrice = Math.round((entry.ttmDividendPerShare / (entry.targetDividendYield / 100)) * 100) / 100;
  const isTargetReached = currentPrice <= targetBuyPrice;
  const dropNeededPercent = isTargetReached
    ? 0
    : Math.round((((currentPrice - targetBuyPrice) / currentPrice) * 100) * 100) / 100;

  return {
    inPool: true,
    ttmDividendPerShare: entry.ttmDividendPerShare,
    currentYield,
    targetYield: entry.targetDividendYield,
    targetBuyPrice,
    dropNeededPercent,
    isTargetReached,
    payoutNote: entry.payoutNote,
  };
}

export function toSearchItem(item: {
  code: string;
  name: string;
  pinyin: string;
  sector: string;
}): StockSearchItem | null {
  const info = inferBoardAndExchange(item.code);
  if (!info) return null;
  return {
    code: item.code,
    name: item.name,
    market: info.market,
    board: info.board,
    sector: item.sector,
    pinyin: item.pinyin,
    isHighDividend: DIVIDEND_MAP.has(item.code),
  };
}
