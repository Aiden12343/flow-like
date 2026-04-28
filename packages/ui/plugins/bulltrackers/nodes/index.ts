/**
 * @fileoverview Bulltrackers Node Type Definitions
 *
 * Each node maps 1:1 to a structure in the TaskDefinition IR.
 * The nodes define their input/output ports using the strongly-typed
 * port system, enabling client-side validation before backend calls.
 */

import { BT_PORT_TYPES, type BtPortDefinition } from '../ports/types';

// ─── Node Type Registry ────────────────────────────────────────

export const BT_NODE_TYPES = {
  TRIGGER: 'bt:trigger',
  DATA_INPUT: 'bt:data_input',
  TRANSFORM: 'bt:transform',
  CONDITION: 'bt:condition',
  AGGREGATION: 'bt:aggregation',
  OUTPUT: 'bt:output',
  SCHEDULE: 'bt:schedule',
  LOOP: 'bt:loop',
  MERGE: 'bt:merge',
} as const;

export type BtNodeType = (typeof BT_NODE_TYPES)[keyof typeof BT_NODE_TYPES];

// ─── Node Configuration Schemas ────────────────────────────────

export interface BtNodeConfig {
  type: BtNodeType;
  label: string;
  description: string;
  category: 'triggers' | 'data' | 'libraries' | 'logic' | 'outputs';
  icon: string;
  inputs: BtPortDefinition[];
  outputs: BtPortDefinition[];
  /** Default config values for the node's settings panel */
  defaultConfig: Record<string, unknown>;
  /** JSON schema for the node's config panel */
  configSchema?: Record<string, unknown>;
}

// ─── Node Definitions ──────────────────────────────────────────

export const TRIGGER_NODE: BtNodeConfig = {
  type: BT_NODE_TYPES.TRIGGER,
  label: 'Trigger',
  description: 'Entry point for the computation task. Defines how the task is initiated.',
  category: 'triggers',
  icon: 'Zap',
  inputs: [],
  outputs: [
    {
      id: 'trigger_out',
      label: 'Execution',
      type: BT_PORT_TYPES.TRIGGER_SIGNAL,
      direction: 'output',
      required: false,
    },
  ],
  defaultConfig: {
    triggerKind: 'manual',
  },
  configSchema: {
    type: 'object',
    properties: {
      triggerKind: {
        type: 'string',
        enum: ['manual', 'schedule', 'event'],
        description: 'How the task is triggered',
      },
    },
  },
};

export const DATA_INPUT_NODE: BtNodeConfig = {
  type: BT_NODE_TYPES.DATA_INPUT,
  label: 'Data Source',
  description: 'Reads rows from a BigQuery table with configurable lookback window.',
  category: 'data',
  icon: 'Database',
  inputs: [
    {
      id: 'trigger_in',
      label: 'Trigger',
      type: BT_PORT_TYPES.TRIGGER_SIGNAL,
      direction: 'input',
      required: true,
    },
  ],
  outputs: [
    {
      id: 'rows_out',
      label: 'Rows',
      type: BT_PORT_TYPES.ROW_ARRAY,
      direction: 'output',
      required: false,
    },
  ],
  defaultConfig: {
    dataSource: '',
    fields: [],
    lookbackDays: 7,
    required: true,
  },
  configSchema: {
    type: 'object',
    properties: {
      dataSource: { type: 'string', description: 'Table name from bulltrackers.config.ts' },
      fields: { type: 'array', items: { type: 'string' }, description: 'Columns to select' },
      lookbackDays: { type: 'number', minimum: 1, maximum: 365, description: 'Days of historical data' },
      required: { type: 'boolean', description: 'Whether this input is mandatory' },
    },
  },
};

export const TRANSFORM_NODE: BtNodeConfig = {
  type: BT_NODE_TYPES.TRANSFORM,
  label: 'Transform',
  description: 'Apply a library function to transform data. Maps to ctx.lib.<module>.<function>().',
  category: 'libraries',
  icon: 'Wand2',
  inputs: [
    {
      id: 'data_in',
      label: 'Data',
      type: BT_PORT_TYPES.ANY,
      direction: 'input',
      required: true,
    },
  ],
  outputs: [
    {
      id: 'data_out',
      label: 'Result',
      type: BT_PORT_TYPES.ANY,
      direction: 'output',
      required: false,
    },
  ],
  defaultConfig: {
    libraryModule: '',
    functionName: '',
    parameters: {},
  },
  configSchema: {
    type: 'object',
    properties: {
      libraryModule: { type: 'string', description: 'Library module (e.g., "math", "finance")' },
      functionName: { type: 'string', description: 'Function to call (e.g., "calculateAverage")' },
      parameters: { type: 'object', description: 'Additional function parameters' },
    },
  },
};

export const CONDITION_NODE: BtNodeConfig = {
  type: BT_NODE_TYPES.CONDITION,
  label: 'Condition',
  description: 'Branch the flow based on a boolean expression.',
  category: 'logic',
  icon: 'GitFork',
  inputs: [
    {
      id: 'data_in',
      label: 'Input',
      type: BT_PORT_TYPES.ANY,
      direction: 'input',
      required: true,
    },
  ],
  outputs: [
    {
      id: 'true_out',
      label: 'True',
      type: BT_PORT_TYPES.ANY,
      direction: 'output',
      required: false,
    },
    {
      id: 'false_out',
      label: 'False',
      type: BT_PORT_TYPES.ANY,
      direction: 'output',
      required: false,
    },
  ],
  defaultConfig: {
    operator: '>',
    compareField: '',
    compareValue: 0,
    expression: '',
  },
  configSchema: {
    type: 'object',
    properties: {
      operator: { type: 'string', enum: ['>', '<', '>=', '<=', '===', '!==', 'includes', 'custom'], description: 'Comparison operator' },
      compareField: { type: 'string', description: 'Field to compare' },
      compareValue: { description: 'Value to compare against' },
      expression: { type: 'string', description: 'Custom JS expression (for operator=custom)' },
    },
  },
};

export const AGGREGATION_NODE: BtNodeConfig = {
  type: BT_NODE_TYPES.AGGREGATION,
  label: 'Aggregate',
  description: 'Reduce, group, or sort data rows.',
  category: 'logic',
  icon: 'Layers',
  inputs: [
    {
      id: 'data_in',
      label: 'Data',
      type: BT_PORT_TYPES.ROW_ARRAY,
      direction: 'input',
      required: true,
    },
  ],
  outputs: [
    {
      id: 'result_out',
      label: 'Result',
      type: BT_PORT_TYPES.ANY,
      direction: 'output',
      required: false,
    },
  ],
  defaultConfig: {
    operation: 'reduce',
    groupByField: '',
    sortField: '',
    sortOrder: 'asc',
    reduceFunction: 'sum',
    reduceField: '',
  },
  configSchema: {
    type: 'object',
    properties: {
      operation: { type: 'string', enum: ['reduce', 'group', 'sort', 'filter', 'map'], description: 'Aggregation type' },
      groupByField: { type: 'string' },
      sortField: { type: 'string' },
      sortOrder: { type: 'string', enum: ['asc', 'desc'] },
      reduceFunction: { type: 'string', enum: ['sum', 'avg', 'min', 'max', 'count', 'custom'] },
      reduceField: { type: 'string' },
    },
  },
};

export const OUTPUT_NODE: BtNodeConfig = {
  type: BT_NODE_TYPES.OUTPUT,
  label: 'Output',
  description: 'Write results to a target: BigQuery, notifications, or outbox.',
  category: 'outputs',
  icon: 'Upload',
  inputs: [
    {
      id: 'data_in',
      label: 'Result',
      type: BT_PORT_TYPES.ANY,
      direction: 'input',
      required: true,
    },
  ],
  outputs: [],
  defaultConfig: {
    target: 'bigquery',
    label: '',
    schema: {},
  },
  configSchema: {
    type: 'object',
    properties: {
      target: { type: 'string', enum: ['bigquery', 'notification', 'outbox_email'], description: 'Output destination' },
      label: { type: 'string', description: 'Human-readable label for this output' },
      schema: { type: 'object', description: 'Output data schema' },
    },
  },
};

export const SCHEDULE_NODE: BtNodeConfig = {
  type: BT_NODE_TYPES.SCHEDULE,
  label: 'Schedule',
  description: 'Configure when the task runs. Connects to a Trigger node.',
  category: 'triggers',
  icon: 'Clock',
  inputs: [],
  outputs: [
    {
      id: 'schedule_out',
      label: 'Schedule',
      type: BT_PORT_TYPES.SCHEDULE_CONFIG,
      direction: 'output',
      required: false,
    },
  ],
  defaultConfig: {
    frequency: 'daily',
    cron: null,
    time: '08:00',
    timezone: 'UTC',
    dayOfWeek: null,
    dayOfMonth: null,
    active: true,
  },
  configSchema: {
    type: 'object',
    properties: {
      frequency: { type: 'string', enum: ['hourly', 'daily', 'weekly', 'monthly', 'event-driven'] },
      cron: { type: 'string', nullable: true },
      time: { type: 'string', nullable: true },
      timezone: { type: 'string', nullable: true },
      dayOfWeek: { type: 'number', nullable: true, minimum: 0, maximum: 6 },
      dayOfMonth: { type: 'number', nullable: true, minimum: 1, maximum: 31 },
      active: { type: 'boolean' },
    },
  },
};

export const LOOP_NODE: BtNodeConfig = {
  type: BT_NODE_TYPES.LOOP,
  label: 'Loop (ForEach)',
  description: 'Iterate over each element in an array.',
  category: 'logic',
  icon: 'Repeat',
  inputs: [
    {
      id: 'array_in',
      label: 'Array',
      type: BT_PORT_TYPES.ARRAY,
      direction: 'input',
      required: true,
    },
  ],
  outputs: [
    {
      id: 'item_out',
      label: 'Item',
      type: BT_PORT_TYPES.ANY,
      direction: 'output',
      required: false,
    },
    {
      id: 'collected_out',
      label: 'Collected',
      type: BT_PORT_TYPES.ARRAY,
      direction: 'output',
      required: false,
    },
  ],
  defaultConfig: {},
};

export const MERGE_NODE: BtNodeConfig = {
  type: BT_NODE_TYPES.MERGE,
  label: 'Merge',
  description: 'Combine multiple data streams into one.',
  category: 'logic',
  icon: 'Merge',
  inputs: [
    {
      id: 'data_a',
      label: 'Input A',
      type: BT_PORT_TYPES.ANY,
      direction: 'input',
      required: true,
    },
    {
      id: 'data_b',
      label: 'Input B',
      type: BT_PORT_TYPES.ANY,
      direction: 'input',
      required: false,
    },
  ],
  outputs: [
    {
      id: 'merged_out',
      label: 'Merged',
      type: BT_PORT_TYPES.ANY,
      direction: 'output',
      required: false,
    },
  ],
  defaultConfig: {
    mergeStrategy: 'concat',
  },
  configSchema: {
    type: 'object',
    properties: {
      mergeStrategy: { type: 'string', enum: ['concat', 'zip', 'object_assign'], description: 'How to combine inputs' },
    },
  },
};

// ─── Registry ──────────────────────────────────────────────────

export const bulltrackersNodeTypes: Record<BtNodeType, BtNodeConfig> = {
  [BT_NODE_TYPES.TRIGGER]: TRIGGER_NODE,
  [BT_NODE_TYPES.DATA_INPUT]: DATA_INPUT_NODE,
  [BT_NODE_TYPES.TRANSFORM]: TRANSFORM_NODE,
  [BT_NODE_TYPES.CONDITION]: CONDITION_NODE,
  [BT_NODE_TYPES.AGGREGATION]: AGGREGATION_NODE,
  [BT_NODE_TYPES.OUTPUT]: OUTPUT_NODE,
  [BT_NODE_TYPES.SCHEDULE]: SCHEDULE_NODE,
  [BT_NODE_TYPES.LOOP]: LOOP_NODE,
  [BT_NODE_TYPES.MERGE]: MERGE_NODE,
};
