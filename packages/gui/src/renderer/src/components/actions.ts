import type { ActionRequest, ActionResult } from '../data/types'

/** Shared shape for the action dispatcher passed down to interactive components. */
export type OnAction = (req: ActionRequest) => Promise<ActionResult>
