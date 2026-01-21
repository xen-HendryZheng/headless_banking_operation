import { BalanceRules } from './BalanceRules';
import { InsufficientBalanceError } from '../common/DomainErrors';

/**
 * Implementation of balance validation rules.
 */
export class BalanceRulesImpl implements BalanceRules {
  assertNoNegative(currentBalance: bigint, delta: bigint): void {
    const newBalance = currentBalance + delta;

    if (newBalance < 0n) {
      throw new InsufficientBalanceError();
    }
  }
}
