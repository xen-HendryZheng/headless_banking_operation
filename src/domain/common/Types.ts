// ===== Core Type Aliases =====

export type UUID = string;

export type Currency = 'PHP' | 'USD' | string;

export type TxType = 'DEPOSIT' | 'WITHDRAW' | 'TRANSFER' | 'FEE';

export type TxStatus = 'PENDING' | 'POSTED' | 'FAILED';
