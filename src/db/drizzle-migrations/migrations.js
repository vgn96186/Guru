// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_baseline_v164.sql';
import m0001 from './0001_provider_orders.sql';
import m0002 from './0002_web_search_order.sql';
import m0003 from './0003_embedding_provider.sql';
import m0004 from './0004_action_hub_tools.sql';

export default {
  journal,
  migrations: {
    m0000,
    m0001,
    m0002,
    m0003,
    m0004,
  },
};
