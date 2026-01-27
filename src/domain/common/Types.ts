// ===== Core Type Aliases =====

export type UUID = string;

export type Currency = 'PHP' | 'USD' | string;

export type TxType = 'DEPOSIT' | 'WITHDRAW' | 'TRANSFER' | 'REVERSAL';

export type TxStatus = 'PENDING' | 'POSTED' | 'FAILED';
