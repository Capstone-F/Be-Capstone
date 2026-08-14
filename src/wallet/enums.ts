/** Which way money moved for the customer wallet on a ledger row. */
export enum WalletTransactionDirection {
  /** Money into the wallet (top-up, refund). */
  CREDIT = 'CREDIT',
  /** Money out of the wallet (booking, treatment, order payment). */
  DEBIT = 'DEBIT',
}
