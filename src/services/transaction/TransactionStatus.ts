import { TxStatus } from '../../domain/common/Types';

/**
 * Helper class for transaction status operations.
 */
export class TransactionStatusHelper {
  static isPending(status: TxStatus): boolean {
    return status === 'PENDING';
  }

  static isPosted(status: TxStatus): boolean {
    return status === 'POSTED';
  }

  static isFailed(status: TxStatus): boolean {
    return status === 'FAILED';
  }

  /**
   * Checks if a transition from one status to another is allowed.
   */
  static canTransitionTo(from: TxStatus, to: TxStatus): boolean {
    // PENDING can transition to POSTED or FAILED
    // POSTED and FAILED are terminal states
    if (from === 'PENDING') {
      return to === 'POSTED' || to === 'FAILED';
    }
    return false;
  }
}
