export enum ShelfLifeUnit {
  DAY = 'DAY',
  MONTH = 'MONTH',
  YEAR = 'YEAR',
}

export enum StockMovementType {
  IMPORT = 'IMPORT',
  SALE = 'SALE',
  RETURN = 'RETURN',
  ADJUSTMENT = 'ADJUSTMENT',
}

export enum ProductInstanceStatus {
  ON_RACK = 'ON_RACK',
  RESERVED = 'RESERVED',
  SOLD = 'SOLD',
  RETURNED = 'RETURNED',
  DAMAGED = 'DAMAGED',
}

export enum InventoryStockWarning {
  LOW = 'LOW',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
}

export enum StockImportFormStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
}
