/**
 * @fileoverview Right-Click Context Menu Catalog
 *
 * Structures the node catalog into the hierarchical menu
 * that appears on right-click within the flow-like canvas.
 *
 * Categories map to the node types defined in ../nodes/index.ts.
 * Library sub-items map to skills.lib.allowedModules from
 * bulltrackers.config.ts.
 */

import { BT_NODE_TYPES, type BtNodeType } from '../nodes';

// ─── Menu Item Type ────────────────────────────────────────────

export interface CatalogMenuItem {
  id: string;
  label: string;
  description?: string;
  icon: string;
  /** If set, creates this node type on click */
  nodeType?: BtNodeType;
  /** Pre-filled config for this specific menu item variant */
  defaultConfig?: Record<string, unknown>;
  /** Nested sub-menu items */
  children?: CatalogMenuItem[];
  /** Visual separator before this item */
  separator?: boolean;
  /** Disabled with "Coming Soon" badge */
  comingSoon?: boolean;
}

// ─── Available Data Tables ─────────────────────────────────────

/**
 * Mirrors the `tables` config from bulltrackers.config.ts.
 * Each entry creates a pre-configured Data Input node.
 */
const DATA_SOURCE_ITEMS: CatalogMenuItem[] = [
  {
    id: 'ds-portfolio-snapshots',
    label: 'Portfolio Snapshots',
    description: 'User portfolio positions and balances',
    icon: 'Briefcase',
    nodeType: BT_NODE_TYPES.DATA_INPUT,
    defaultConfig: { dataSource: 'portfolio_snapshots', fields: ['user_id', 'portfolio_data', 'date'], lookbackDays: 7 },
  },
  {
    id: 'ds-trade-history',
    label: 'Trade History',
    description: 'Executed trades and order history',
    icon: 'ArrowLeftRight',
    nodeType: BT_NODE_TYPES.DATA_INPUT,
    defaultConfig: { dataSource: 'trade_history', fields: ['user_id', 'trade_data', 'date'], lookbackDays: 30 },
  },
  {
    id: 'ds-pi-rankings',
    label: 'PI Rankings',
    description: 'Popular Investor ranking data',
    icon: 'Trophy',
    nodeType: BT_NODE_TYPES.DATA_INPUT,
    defaultConfig: { dataSource: 'pi_rankings', fields: ['pi_id', 'username', 'rankings_data', 'date'], lookbackDays: 30 },
  },
  {
    id: 'ds-asset-prices',
    label: 'Asset Prices',
    description: 'Current and historical instrument prices',
    icon: 'TrendingUp',
    nodeType: BT_NODE_TYPES.DATA_INPUT,
    defaultConfig: { dataSource: 'asset_prices', fields: ['instrument_id', 'price', 'date'], lookbackDays: 14 },
  },
  {
    id: 'ds-risk-scores',
    label: 'Risk Scores',
    description: 'Computed risk metrics per portfolio',
    icon: 'ShieldAlert',
    nodeType: BT_NODE_TYPES.DATA_INPUT,
    defaultConfig: { dataSource: 'risk_scores', fields: ['user_id', 'risk_data', 'date'], lookbackDays: 7 },
  },
  {
    id: 'ds-dashboard-data',
    label: 'Dashboard Data',
    description: 'Pre-computed dashboard metrics',
    icon: 'LayoutDashboard',
    nodeType: BT_NODE_TYPES.DATA_INPUT,
    defaultConfig: { dataSource: 'dashboard_data', fields: ['user_id', 'metrics', 'date'], lookbackDays: 7 },
  },
];

// ─── Library Module Items ──────────────────────────────────────

/**
 * Maps to skills.lib.allowedModules from bulltrackers.config.ts.
 * Each creates a Transform node pre-configured with the library module.
 */
const LIBRARY_ITEMS: CatalogMenuItem[] = [
  {
    id: 'lib-math',
    label: 'Math',
    description: 'Statistical operations: avg, stddev, percentile',
    icon: 'Calculator',
    nodeType: BT_NODE_TYPES.TRANSFORM,
    defaultConfig: { libraryModule: 'math' },
  },
  {
    id: 'lib-finance',
    label: 'Finance',
    description: 'Financial calculations: returns, Sharpe ratio, drawdown',
    icon: 'DollarSign',
    nodeType: BT_NODE_TYPES.TRANSFORM,
    defaultConfig: { libraryModule: 'finance' },
  },
  {
    id: 'lib-portfolio',
    label: 'Portfolio',
    description: 'Portfolio analysis: allocation, drift, rebalancing',
    icon: 'PieChart',
    nodeType: BT_NODE_TYPES.TRANSFORM,
    defaultConfig: { libraryModule: 'portfolio' },
  },
  {
    id: 'lib-rankings',
    label: 'Rankings',
    description: 'PI ranking extraction and comparison',
    icon: 'BarChart3',
    nodeType: BT_NODE_TYPES.TRANSFORM,
    defaultConfig: { libraryModule: 'rankings' },
  },
  {
    id: 'lib-trades',
    label: 'Trades',
    description: 'Trade history parsing and analysis',
    icon: 'Activity',
    nodeType: BT_NODE_TYPES.TRANSFORM,
    defaultConfig: { libraryModule: 'trades' },
  },
  {
    id: 'lib-instruments',
    label: 'Instruments',
    description: 'Ticker/instrument resolution and lookup',
    icon: 'Search',
    nodeType: BT_NODE_TYPES.TRANSFORM,
    defaultConfig: { libraryModule: 'instruments' },
  },
  {
    id: 'lib-risk',
    label: 'Risk',
    description: 'Risk score calculations and thresholds',
    icon: 'ShieldCheck',
    nodeType: BT_NODE_TYPES.TRANSFORM,
    defaultConfig: { libraryModule: 'risk' },
  },
  {
    id: 'lib-behavioral',
    label: 'Behavioral',
    description: 'Behavioral anomaly detection and pattern matching',
    icon: 'Brain',
    nodeType: BT_NODE_TYPES.TRANSFORM,
    defaultConfig: { libraryModule: 'behavioral' },
  },
  {
    id: 'lib-formatting',
    label: 'Formatting',
    description: 'Data formatting, currency, percentage, date helpers',
    icon: 'Type',
    nodeType: BT_NODE_TYPES.TRANSFORM,
    defaultConfig: { libraryModule: 'formatting' },
  },
  {
    id: 'lib-notifications',
    label: 'Notifications',
    description: 'Build notification payloads for push/email',
    icon: 'Bell',
    nodeType: BT_NODE_TYPES.TRANSFORM,
    defaultConfig: { libraryModule: 'notifications' },
  },
];

// ─── Full Context Menu ─────────────────────────────────────────

export const bulltrackersContextMenu: CatalogMenuItem[] = [
  {
    id: 'cat-triggers',
    label: 'Triggers',
    icon: 'Zap',
    children: [
      {
        id: 'trigger-manual',
        label: 'Manual Trigger',
        description: 'Triggered manually via UI or API',
        icon: 'MousePointerClick',
        nodeType: BT_NODE_TYPES.TRIGGER,
        defaultConfig: { triggerKind: 'manual' },
      },
      {
        id: 'trigger-scheduled',
        label: 'Scheduled Trigger',
        description: 'Runs on a cron schedule',
        icon: 'Clock',
        nodeType: BT_NODE_TYPES.TRIGGER,
        defaultConfig: { triggerKind: 'schedule' },
      },
      {
        id: 'trigger-event',
        label: 'Event Trigger',
        description: 'Triggered by a system event',
        icon: 'Radio',
        nodeType: BT_NODE_TYPES.TRIGGER,
        defaultConfig: { triggerKind: 'event' },
      },
      {
        id: 'schedule-config',
        label: 'Schedule Configuration',
        description: 'Define cron, frequency, and timezone',
        icon: 'CalendarClock',
        nodeType: BT_NODE_TYPES.SCHEDULE,
        separator: true,
      },
    ],
  },
  {
    id: 'cat-data',
    label: 'Data Sources',
    icon: 'Database',
    children: DATA_SOURCE_ITEMS,
  },
  {
    id: 'cat-libraries',
    label: 'Libraries',
    icon: 'Library',
    children: LIBRARY_ITEMS,
  },
  {
    id: 'cat-logic',
    label: 'Logic',
    icon: 'GitBranch',
    children: [
      {
        id: 'logic-condition',
        label: 'Condition (If/Else)',
        description: 'Branch based on a boolean expression',
        icon: 'GitFork',
        nodeType: BT_NODE_TYPES.CONDITION,
      },
      {
        id: 'logic-loop',
        label: 'Loop (ForEach)',
        description: 'Iterate over array elements',
        icon: 'Repeat',
        nodeType: BT_NODE_TYPES.LOOP,
      },
      {
        id: 'logic-merge',
        label: 'Merge',
        description: 'Combine multiple data streams',
        icon: 'Merge',
        nodeType: BT_NODE_TYPES.MERGE,
      },
      {
        id: 'logic-aggregate',
        label: 'Aggregate',
        description: 'Reduce, group, sort, or filter data',
        icon: 'Layers',
        nodeType: BT_NODE_TYPES.AGGREGATION,
      },
    ],
  },
  {
    id: 'cat-outputs',
    label: 'Outputs',
    icon: 'Upload',
    children: [
      {
        id: 'output-bigquery',
        label: 'BigQuery Result',
        description: 'Write computation results to BigQuery',
        icon: 'Database',
        nodeType: BT_NODE_TYPES.OUTPUT,
        defaultConfig: { target: 'bigquery' },
      },
      {
        id: 'output-notification',
        label: 'Push Notification',
        description: 'Send a push notification to the user',
        icon: 'Bell',
        nodeType: BT_NODE_TYPES.OUTPUT,
        defaultConfig: { target: 'notification' },
      },
      {
        id: 'output-email',
        label: 'Outbox Email',
        description: 'Queue an email via the outbox system',
        icon: 'Mail',
        nodeType: BT_NODE_TYPES.OUTPUT,
        defaultConfig: { target: 'outbox_email' },
      },
    ],
  },
  {
    id: 'cat-plugins',
    label: 'Custom Plugins',
    icon: 'Plug',
    comingSoon: true,
    children: [
      {
        id: 'plugin-custom-lifecycle',
        label: 'Lifecycle Hook',
        description: 'Custom plugin that hooks into the computation lifecycle',
        icon: 'Webhook',
        comingSoon: true,
      },
      {
        id: 'plugin-custom-transform',
        label: 'Custom Runtime Plugin',
        description: 'Modify the computation task lifecycle via event bus',
        icon: 'Cpu',
        comingSoon: true,
      },
    ],
  },
];

export const catalogItemRegistry = new Map<string, CatalogMenuItem>();

function populateRegistry(items: CatalogMenuItem[]) {
  for (const item of items) {
    if (item.nodeType) catalogItemRegistry.set(item.id, item);
    if (item.children) populateRegistry(item.children);
  }
}
populateRegistry(bulltrackersContextMenu);
