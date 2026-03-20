import type { z } from "zod";
import type { AutomationActionSchema, AutomationRuleSchema, AutomationTriggerSchema } from "./schemas";

export type AutomationTrigger = z.infer<typeof AutomationTriggerSchema>;
export type AutomationAction = z.infer<typeof AutomationActionSchema>;
export type AutomationRule = z.infer<typeof AutomationRuleSchema>;
