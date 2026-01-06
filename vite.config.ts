import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const apiTarget = process.env.VITE_API_TARGET || 'http://127.0.0.1:3000'

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'standup-local-mock-api',
      configureServer(server) {
        // Only in dev, provide a minimal /api implementation when the real backend isn't running.
        const json = (res: any, status: number, body: any) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(body))
        }

        server.middlewares.use('/api/auth/session', (req, res, next) => {
          // If a real backend is expected (proxy works), let it handle it.
          // Otherwise return a stable JSON response.
          // NOTE: proxy errors happen before middleware when proxy is enabled; so we don't proxy at all.
          json(res, 200, { user: null })
        })

        server.middlewares.use('/api/auth/logout', (req, res) => {
          json(res, 200, { ok: true })
        })

        server.middlewares.use('/api/auth/request-link', async (req, res) => {
          json(res, 200, { ok: true })
        })

        server.middlewares.use('/api/auth/verify', async (req, res) => {
          json(res, 200, {
            user: {
              id: 'dev-user',
              email: 'dev@local',
              name: 'Dev User',
              role: 'manager',
              teamId: 'dev-team',
            },
          })
        })

        server.middlewares.use('/api/standup/today', (req, res) => {
          json(res, 200, {
            date: new Date().toISOString().slice(0, 10),
            cutoffAt: new Date().toISOString(),
            editable: true,
            etag: 'dev',
            teamName: 'Dev Team',
            viewer: { userId: 'dev-user', role: 'manager' },
            rows: [
              {
                userId: 'dev-user',
                name: 'Dev User',
                yesterday: '',
                today: '',
                blockers: '',
                status: 'missing',
              },
            ],
          })
        })

        server.middlewares.use('/api/standup/update', (req, res) => {
          json(res, 200, {
            date: new Date().toISOString().slice(0, 10),
            cutoffAt: new Date().toISOString(),
            editable: true,
            etag: 'dev',
            teamName: 'Dev Team',
            viewer: { userId: 'dev-user', role: 'manager' },
            rows: [
              {
                userId: 'dev-user',
                name: 'Dev User',
                yesterday: 'Saved (dev mock)',
                today: 'Saved (dev mock)',
                blockers: 'None',
                status: 'prepared',
              },
            ],
          })
        })

        server.middlewares.use('/api/standup/history', (req, res) => {
          const today = new Date().toISOString().slice(0, 10)
          json(res, 200, {
            days: [
              {
                date: today,
                rows: [{ userId: 'dev-user', name: 'Dev User', status: 'missing' }],
              },
            ],
          })
        })

        server.middlewares.use('/api/kpi/team', (req, res) => {
          json(res, 200, {
            teamName: 'Dev Team',
            teamCompliancePercent: 0,
            users: [
              {
                userId: 'dev-user',
                name: 'Dev User',
                prepared: 0,
                partial: 0,
                missing: 0,
                weeklyAveragePercent: 0,
                missingStreak: 0,
              },
            ],
          })
        })

        server.middlewares.use('/api/manager/team', (req, res) => {
          json(res, 200, {
            teamId: 'dev-team',
            teamName: 'Dev Team',
            standupCutoffTime: '09:30',
            members: [
              {
                userId: 'dev-user',
                name: 'Dev User',
                email: 'dev@local',
                role: 'manager',
              },
            ],
          })
        })

        server.middlewares.use('/api/manager/cutoff', (req, res) => {
          json(res, 200, {
            teamId: 'dev-team',
            teamName: 'Dev Team',
            standupCutoffTime: '09:30',
            members: [],
          })
        })

        server.middlewares.use('/api/manager/members', (req, res) => {
          json(res, 200, {
            teamId: 'dev-team',
            teamName: 'Dev Team',
            standupCutoffTime: '09:30',
            members: [],
          })
        })

        server.middlewares.use('/api', (req, res, next) => {
          // Catch-all for any unimplemented endpoint
          json(res, 404, { error: 'Not implemented in dev mock. Run `vercel dev` for full backend.' })
        })
      },
    },
  ],
  // For real backend development, use:
  // VITE_API_TARGET=http://127.0.0.1:3000 npm run dev
  // and run `vercel dev --listen 3000` in another terminal.
  // The mock API above is for frontend-only dev convenience.
  server: {
    // Intentionally no proxy by default to avoid ECONNREFUSED -> 500 noise.
    // If you want to proxy to a real backend, set VITE_USE_PROXY=1.
    proxy:
      process.env.VITE_USE_PROXY === '1'
        ? {
            '/api': {
              target: apiTarget,
              changeOrigin: true,
            },
          }
        : undefined,
  },
})
