/**
 * @fileoverview Strongly-Typed Port System for Bulltrackers Nodes
 *
 * Defines the type-safe port system that prevents incompatible
 * connections at the canvas level — before any backend validation.
 * This is the "Pre-Verification Shield": ~90% of invalid tasks
 * are caught here.
 *
 * The port types map to the data structures consumed by the
 * DefaultContextPlugin (data slicing, lib injection) and
 * the TaskDefinition IR (inputs, steps, outputs).
 */

// ─── Port Type Identifiers ─────────────────────────────────────

export const BT_PORT_TYPES = {
  /** Execution trigger signal — connects trigger to first step */
  TRIGGER_SIGNAL: 'bt:trigger_signal',
  /** Array of rows from a BigQuery table */
  ROW_ARRAY: 'bt:row_array',
  /** Single scalar value (number, string, boolean) */
  SCALAR: 'bt:scalar',
  /** Numeric scalar specifically */
  NUMBER: 'bt:number',
  /** String scalar specifically */
  STRING: 'bt:string',
  /** Boolean scalar specifically */
  BOOLEAN: 'bt:boolean',
  /** Structured object / record */
  RECORD: 'bt:record',
  /** Array of any typed elements */
  ARRAY: 'bt:array',
  /** Configuration object for schedule/trigger */
  SCHEDULE_CONFIG: 'bt:schedule_config',
  /** Final result object sent to an output sink */
  RESULT: 'bt:result',
  /** Log/notification payload */
  NOTIFICATION: 'bt:notification',
  /** Generic "any" — used for library transform pass-through */
  ANY: 'bt:any',
} as const;

export type BtPortType = (typeof BT_PORT_TYPES)[keyof typeof BT_PORT_TYPES];

// ─── Port Metadata ─────────────────────────────────────────────

export interface BtPortDefinition {
  id: string;
  label: string;
  type: BtPortType;
  /** Direction: 'input' or 'output' */
  direction: 'input' | 'output';
  /** If true, this port must be connected for the node to be valid */
  required: boolean;
  /** Optional sub-type metadata (e.g., table name for ROW_ARRAY) */
  meta?: Record<string, unknown>;
}

// ─── Compatibility Matrix ──────────────────────────────────────

/**
 * Defines which output port types can connect to which input port types.
 * ANY can connect to/from anything. TRIGGER_SIGNAL only connects to itself.
 */
const COMPATIBILITY_MATRIX: Record<BtPortType, BtPortType[]> = {
  [BT_PORT_TYPES.TRIGGER_SIGNAL]: [BT_PORT_TYPES.TRIGGER_SIGNAL],
  [BT_PORT_TYPES.ROW_ARRAY]: [BT_PORT_TYPES.ROW_ARRAY, BT_PORT_TYPES.ARRAY, BT_PORT_TYPES.ANY],
  [BT_PORT_TYPES.SCALAR]: [BT_PORT_TYPES.SCALAR, BT_PORT_TYPES.ANY],
  [BT_PORT_TYPES.NUMBER]: [BT_PORT_TYPES.NUMBER, BT_PORT_TYPES.SCALAR, BT_PORT_TYPES.ANY],
  [BT_PORT_TYPES.STRING]: [BT_PORT_TYPES.STRING, BT_PORT_TYPES.SCALAR, BT_PORT_TYPES.ANY],
  [BT_PORT_TYPES.BOOLEAN]: [BT_PORT_TYPES.BOOLEAN, BT_PORT_TYPES.SCALAR, BT_PORT_TYPES.ANY],
  [BT_PORT_TYPES.RECORD]: [BT_PORT_TYPES.RECORD, BT_PORT_TYPES.ANY],
  [BT_PORT_TYPES.ARRAY]: [BT_PORT_TYPES.ARRAY, BT_PORT_TYPES.ANY],
  [BT_PORT_TYPES.SCHEDULE_CONFIG]: [BT_PORT_TYPES.SCHEDULE_CONFIG],
  [BT_PORT_TYPES.RESULT]: [BT_PORT_TYPES.RESULT, BT_PORT_TYPES.RECORD, BT_PORT_TYPES.ANY],
  [BT_PORT_TYPES.NOTIFICATION]: [BT_PORT_TYPES.NOTIFICATION, BT_PORT_TYPES.RECORD, BT_PORT_TYPES.ANY],
  [BT_PORT_TYPES.ANY]: Object.values(BT_PORT_TYPES) as BtPortType[],
};

// ─── Validation ────────────────────────────────────────────────

export interface PortConnectionValidation {
  valid: boolean;
  reason?: string;
}

/**
 * Validates whether an output port can connect to an input port.
 * Called by the canvas on edge creation to prevent invalid wiring.
 */
export function validatePortConnection(
  sourceType: BtPortType,
  targetType: BtPortType,
): PortConnectionValidation {
  // ANY accepts everything
  if (targetType === BT_PORT_TYPES.ANY || sourceType === BT_PORT_TYPES.ANY) {
    return { valid: true };
  }

  const allowed = COMPATIBILITY_MATRIX[sourceType];
  if (!allowed) {
    return {
      valid: false,
      reason: `Unknown source port type: ${sourceType}`,
    };
  }

  if (allowed.includes(targetType)) {
    return { valid: true };
  }

  return {
    valid: false,
    reason: `Cannot connect ${sourceType} → ${targetType}. Expected one of: ${allowed.join(', ')}`,
  };
}

// ─── Exported Port Type Set ────────────────────────────────────

export const bulltrackersPortTypes = BT_PORT_TYPES;
