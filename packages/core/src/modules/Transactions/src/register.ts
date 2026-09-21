// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { asClass, asFunction, type AwilixContainer } from 'awilix';
import type { ILogObj, Logger } from 'tslog';
import {
  AbstractHandler,
  buildHandlers,
  type HandlerClass,
  type HandlerResolverCradle,
} from '@citrineos/base';
import { OCPP_CallAction } from '@citrineos/types';
import { SignedMeterValuesUtil } from '@util/security/SignedMeterValuesUtil.js';
import { CostCalculator } from './module/CostCalculator.js';
import { CostNotifier, type CostUpdatedNotifier } from './module/CostNotifier.js';
import { StatusNotificationService } from './module/StatusNotificationService.js';
import { TransactionService } from './module/TransactionService.js';
import type { TransactionsModule } from './module/module.js';
import {
  CostUpdatedResponseOcpp2Handler,
  GetTariffsRequestOcpp21Handler,
  GetTransactionStatusResponseOcpp2Handler,
  MeterValuesRequestOcpp16Handler,
  MeterValuesRequestOcpp2Handler,
  NotifySettlementRequestOcpp21Handler,
  SetDefaultTariffResponseOcpp21Handler,
  StartTransactionRequestOcpp16Handler,
  StatusNotificationRequestOcpp16Handler,
  StatusNotificationRequestOcpp2Handler,
  StopTransactionRequestOcpp16Handler,
  TransactionEventRequestOcpp2Handler,
} from '@handlers/index.js';

const TRANSACTIONS_HANDLERS = [
  CostUpdatedResponseOcpp2Handler,
  GetTariffsRequestOcpp21Handler,
  GetTransactionStatusResponseOcpp2Handler,
  MeterValuesRequestOcpp16Handler,
  MeterValuesRequestOcpp2Handler,
  NotifySettlementRequestOcpp21Handler,
  SetDefaultTariffResponseOcpp21Handler,
  StartTransactionRequestOcpp16Handler,
  StatusNotificationRequestOcpp16Handler,
  StatusNotificationRequestOcpp2Handler,
  StopTransactionRequestOcpp16Handler,
  TransactionEventRequestOcpp2Handler,
] satisfies ReadonlyArray<HandlerClass>;

/**
 * Registers the Transactions module's internal services as scoped dependencies.
 */
export function registerTransactionsServices(container: AwilixContainer): void {
  container.register({
    transactionService: asClass(TransactionService).scoped(),
    statusNotificationService: asClass(StatusNotificationService).scoped(),
    costCalculator: asClass(CostCalculator).scoped(),
    costNotifier: asClass(CostNotifier).scoped(),
    signedMeterValuesUtil: asClass(SignedMeterValuesUtil).scoped(),
    // Breaks the former CostNotifier→module cycle: this closure reads `transactionsModule`
    // only when invoked at runtime (deferred), so there is no construction-time resolution
    // cycle. The param annotation keeps `sendCall` fully type-checked.
    costUpdatedNotifier: asFunction(
      (deps: { transactionsModule: TransactionsModule; logger: Logger<ILogObj> }): CostUpdatedNotifier =>
        async ({ ocppConnectionName, tenantId, totalCost, transactionId, protocol }) => {
          const confirmation = await deps.transactionsModule.sendCall(
            ocppConnectionName,
            tenantId,
            protocol,
            OCPP_CallAction.CostUpdated,
            { totalCost, transactionId },
          );
          if (confirmation.success) {
            deps.logger.debug(
              `Sent CostUpdated call for ${transactionId} transaction with ${totalCost} cost`,
            );
          } else {
            deps.logger.warn(
              `Failed to send CostUpdated call for ${transactionId} transaction to ${ocppConnectionName}: ${confirmation.payload}`,
            );
          }
        },
    ).scoped(),
    transactionsHandlers: asFunction((cradle: HandlerResolverCradle): AbstractHandler[] =>
      buildHandlers(cradle.moduleScope, TRANSACTIONS_HANDLERS),
    ).scoped(),
  });
}
