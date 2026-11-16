import { type ModuleMetadata, Module } from "@nestjs/common";
import { type TxRunner, appDatabaseUrl, isPlane, pgRunner } from "@velaq/db";
import { AI_CLIENT, aiFromEnv } from "./ai/ai.js";
import { AppController } from "./app.controller.js";
import { CapabilityService, ENTITLEMENT_STORE } from "./capability.service.js";
import { InMemoryEntitlementStore, PgEntitlementStore } from "./entitlements.js";
import { IdentityModule } from "./identity/identity.module.js";
import { BudgetService } from "./money/budgets.js";
import { BudgetsController } from "./money/budgets.controller.js";
import { GoalService } from "./money/goals.js";
import { GoalsController } from "./money/goals.controller.js";
import { TasksController } from "./tasks/tasks.controller.js";
import { TaskService } from "./tasks/tasks.service.js";
import { MoneyController } from "./money/money.controller.js";
import { MoneyService } from "./money/money.service.js";
import { ProfileController } from "./profile/profile.controller.js";
import { ProfileService } from "./profile/profile.service.js";
import { TailorController } from "./profile/tailor.controller.js";
import { VersionService } from "./profile/versions.js";
import { SpaceModule } from "./space/space.module.js";
import { PERSONAL_DB } from "./space/space.service.js";

// One API process serves one product database (AR-0). Velaq Personal is built first.
const plane = process.env.PLANE ?? "personal";
if (!isPlane(plane)) throw new Error(`PLANE must be business, personal or marketplace, not "${plane}"`);

const entitlementStore: NonNullable<ModuleMetadata["providers"]>[number] =
  plane === "personal"
    ? { provide: ENTITLEMENT_STORE, useFactory: (db: TxRunner) => new PgEntitlementStore(db), inject: [PERSONAL_DB] }
    : {
        provide: ENTITLEMENT_STORE,
        useFactory: () => {
          const url = appDatabaseUrl(plane);
          return url ? new PgEntitlementStore(pgRunner(url)) : new InMemoryEntitlementStore();
        },
      };

@Module({
  imports: [IdentityModule.forPlane(plane), ...(plane === "personal" ? [SpaceModule] : [])],
  // Personal features. Each is registered only on the Personal API.
  controllers: [AppController, ...(plane === "personal" ? [ProfileController, TailorController, MoneyController, BudgetsController, GoalsController, TasksController] : [])],
  providers: [
    ...(plane === "personal" ? [ProfileService, VersionService, MoneyService, BudgetService, GoalService, TaskService] : []),
    // The AI gateway: null until ANTHROPIC_API_KEY is set, and AI features then say they aren't set up.
    { provide: AI_CLIENT, useFactory: () => aiFromEnv() },
    entitlementStore,
    { provide: CapabilityService, useFactory: (store: InMemoryEntitlementStore) => new CapabilityService(store), inject: [ENTITLEMENT_STORE] },
  ],
})
export class AppModule {}
