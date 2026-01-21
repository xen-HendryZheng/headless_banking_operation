import { ValueTransformer } from 'typeorm';

/**
 * TypeORM transformer for bigint columns.
 * Converts between JavaScript bigint and PostgreSQL bigint (stored as string by pg driver).
 */
export class BigIntTransformer implements ValueTransformer {
  /**
   * Convert from JavaScript bigint to database string.
   */
  to(value: bigint | null | undefined): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    return value.toString();
  }

  /**
   * Convert from database string to JavaScript bigint.
   */
  from(value: string | null | undefined): bigint | null {
    if (value === null || value === undefined) {
      return null;
    }
    return BigInt(value);
  }
}
