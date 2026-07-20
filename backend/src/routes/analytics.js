const express = require('express');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');
const { logger } = require('../middleware/logger');

const router = express.Router();

// Safely parse days query param within [1, 90]
const parseDays = (val, def = 7) => Math.min(90, Math.max(1, parseInt(val) || def));

// Build optional app filter clause (avoids SQL injection via allowlist)
const VALID_APPS = new Set(['clinical', 'mychart', 'haiku', 'pacs', 'portal']);
function appClause(appFilter, paramIdx) {
  if (appFilter && VALID_APPS.has(appFilter)) {
    return { clause: `AND app = $${paramIdx}`, value: appFilter };
  }
  return { clause: '', value: null };
}

// POST /api/analytics/pageview — no auth, captures real IP server-side
router.post('/pageview', async (req, res) => {
  try {
    const { sessionId, userId, app, path, route, referrer } = req.body;
    if (!sessionId || !path) return res.status(400).json({ error: 'Missing required fields' });

    const rawIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1')
      .split(',')[0].trim();
    const userAgent = req.headers['user-agent'] || null;
    const safeApp = VALID_APPS.has(app) ? app : 'clinical';

    await pool.query(
      `INSERT INTO analytics_pageviews (session_id, user_id, app, path, route, referrer, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7::inet, $8)`,
      [sessionId, userId || null, safeApp, path.slice(0, 1000), (route || path).slice(0, 1000), referrer?.slice(0, 1000) || null, rawIp, userAgent]
    );
    res.status(204).end();
  } catch (err) {
    logger.error('Analytics pageview ingest error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/analytics/overview
router.get('/overview', authenticate, authorize('admin'), async (req, res) => {
  try {
    const days = parseDays(req.query.days);
    const { clause, value } = appClause(req.query.app, 2);
    const params = value ? [days, value] : [days];
    const prevParams = value ? [days, value] : [days];

    const [curr, prev] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)                                                       AS pageviews,
          COUNT(DISTINCT session_id)                                     AS sessions,
          COUNT(DISTINCT ip_address::text)                               AS unique_visitors,
          COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN user_id END) AS authenticated_users
        FROM analytics_pageviews
        WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL ${clause}
      `, params),
      pool.query(`
        SELECT
          COUNT(*)                             AS pageviews,
          COUNT(DISTINCT session_id)           AS sessions,
          COUNT(DISTINCT ip_address::text)     AS unique_visitors
        FROM analytics_pageviews
        WHERE created_at >= NOW() - ($1 * 2 || ' days')::INTERVAL
          AND created_at <  NOW() - ($1 || ' days')::INTERVAL ${clause}
      `, prevParams),
    ]);

    const c = curr.rows[0];
    const p = prev.rows[0];
    const pctChange = (cn, pn) => {
      const cv = parseInt(cn) || 0, pv = parseInt(pn) || 0;
      if (pv === 0) return null;
      return Math.round(((cv - pv) / pv) * 100);
    };

    res.json({
      pageviews: parseInt(c.pageviews),
      sessions: parseInt(c.sessions),
      uniqueVisitors: parseInt(c.unique_visitors),
      authenticatedUsers: parseInt(c.authenticated_users),
      changes: {
        pageviews: pctChange(c.pageviews, p.pageviews),
        sessions: pctChange(c.sessions, p.sessions),
        uniqueVisitors: pctChange(c.unique_visitors, p.unique_visitors),
      },
    });
  } catch (err) {
    logger.error('Analytics overview error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/analytics/timeseries
router.get('/timeseries', authenticate, authorize('admin'), async (req, res) => {
  try {
    const days = parseDays(req.query.days);
    const { clause, value } = appClause(req.query.app, 2);
    const params = value ? [days, value] : [days];

    const result = await pool.query(`
      SELECT
        DATE_TRUNC('day', created_at)        AS date,
        COUNT(*)                              AS pageviews,
        COUNT(DISTINCT session_id)            AS sessions,
        COUNT(DISTINCT ip_address::text)      AS unique_visitors
      FROM analytics_pageviews
      WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL ${clause}
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY date
    `, params);

    res.json(result.rows.map(r => ({
      date: r.date,
      pageviews: parseInt(r.pageviews),
      sessions: parseInt(r.sessions),
      uniqueVisitors: parseInt(r.unique_visitors),
    })));
  } catch (err) {
    logger.error('Analytics timeseries error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/analytics/top-pages
router.get('/top-pages', authenticate, authorize('admin'), async (req, res) => {
  try {
    const days = parseDays(req.query.days);
    const limit = Math.min(50, Math.max(5, parseInt(req.query.limit) || 20));
    const { clause, value } = appClause(req.query.app, 2);
    const params = value ? [days, value] : [days];

    const result = await pool.query(`
      SELECT
        route,
        app,
        COUNT(*)                         AS pageviews,
        COUNT(DISTINCT session_id)        AS sessions,
        COUNT(DISTINCT ip_address::text)  AS unique_visitors
      FROM analytics_pageviews
      WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL ${clause}
      GROUP BY route, app
      ORDER BY pageviews DESC
      LIMIT ${limit}
    `, params);

    res.json(result.rows.map(r => ({
      route: r.route,
      app: r.app,
      pageviews: parseInt(r.pageviews),
      sessions: parseInt(r.sessions),
      uniqueVisitors: parseInt(r.unique_visitors),
    })));
  } catch (err) {
    logger.error('Analytics top-pages error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/analytics/top-ips
router.get('/top-ips', authenticate, authorize('admin'), async (req, res) => {
  try {
    const days = parseDays(req.query.days);
    const { clause, value } = appClause(req.query.app, 2);
    const params = value ? [days, value] : [days];

    const result = await pool.query(`
      SELECT
        ip_address::text                        AS ip,
        COUNT(*)                                AS pageviews,
        COUNT(DISTINCT session_id)              AS sessions,
        MAX(created_at)                         AS last_seen,
        COUNT(DISTINCT app)                     AS app_count,
        BOOL_OR(user_id IS NOT NULL)            AS has_account,
        array_agg(DISTINCT app ORDER BY app)    AS apps
      FROM analytics_pageviews
      WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL ${clause}
      GROUP BY ip_address
      ORDER BY pageviews DESC
      LIMIT 50
    `, params);

    res.json(result.rows.map(r => ({
      ip: r.ip,
      pageviews: parseInt(r.pageviews),
      sessions: parseInt(r.sessions),
      lastSeen: r.last_seen,
      appCount: parseInt(r.app_count),
      hasAccount: r.has_account,
      apps: r.apps,
    })));
  } catch (err) {
    logger.error('Analytics top-ips error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/analytics/apps
router.get('/apps', authenticate, authorize('admin'), async (req, res) => {
  try {
    const days = parseDays(req.query.days);

    const result = await pool.query(`
      SELECT
        app,
        COUNT(*)                         AS pageviews,
        COUNT(DISTINCT session_id)        AS sessions,
        COUNT(DISTINCT ip_address::text)  AS unique_visitors
      FROM analytics_pageviews
      WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL
      GROUP BY app
      ORDER BY pageviews DESC
    `, [days]);

    res.json(result.rows.map(r => ({
      app: r.app,
      pageviews: parseInt(r.pageviews),
      sessions: parseInt(r.sessions),
      uniqueVisitors: parseInt(r.unique_visitors),
    })));
  } catch (err) {
    logger.error('Analytics apps error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/analytics/realtime — last 30 min activity
router.get('/realtime', authenticate, authorize('admin'), async (req, res) => {
  try {
    const [events, active] = await Promise.all([
      pool.query(`
        SELECT id, session_id, user_id, app, path, route, ip_address::text AS ip, user_agent, created_at
        FROM analytics_pageviews
        WHERE created_at >= NOW() - INTERVAL '30 minutes'
        ORDER BY created_at DESC
        LIMIT 50
      `),
      pool.query(`
        SELECT COUNT(DISTINCT session_id) AS active_sessions
        FROM analytics_pageviews
        WHERE created_at >= NOW() - INTERVAL '5 minutes'
      `),
    ]);

    res.json({
      activeSessions: parseInt(active.rows[0].active_sessions),
      events: events.rows.map(r => ({
        id: r.id,
        sessionId: r.session_id,
        userId: r.user_id,
        app: r.app,
        path: r.path,
        route: r.route,
        ip: r.ip,
        userAgent: r.user_agent,
        timestamp: r.created_at,
      })),
    });
  } catch (err) {
    logger.error('Analytics realtime error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
