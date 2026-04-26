# 06 · Frontend (Dashboard React)

SPA en React 18 que es la **interfaz de control y observabilidad** del sistema. Permite ver eventos, alertas y métricas, y administrar patrones CEP y escenarios de simulación.

- **Framework**: React 18 (Create React App)
- **Comunicación**:
  - HTTP polling cada 5 s contra la API REST (eventos, stats, patrones, escenarios, simulator config).
  - WebSocket (Socket.IO) para alertas en tiempo real.
- **UI libs**: `lucide-react` (iconos), `axios`, `socket.io-client`, `recharts` (gráficos).
- **Servido por**: Nginx (`nginx.conf`) en producción.
- **Puerto**: 3000 (host) → 80 (container).
- **Container**: `ucis-frontend`

## Estructura por pestañas

El componente raíz [`App.js`](../../services/frontend/src/App.js) gestiona estado global y renderiza una de 5 pestañas según `activeTab`:

1. **Dashboard** ([components/dashboard/](../../services/frontend/src/components/dashboard/)): KPIs, gráfico de eventos por minuto, tabla de patrones activos, alertas recientes y el strip del simulador.
2. **Events** ([components/events/](../../services/frontend/src/components/events/)): tabla paginada con filtros por dominio, zona y severidad.
3. **Alerts** ([components/alerts/](../../services/frontend/src/components/alerts/)): alertas (complex events) coloreadas por severidad.
4. **Patterns** ([components/patterns/](../../services/frontend/src/components/patterns/)): CRUD de reglas EPL con modal de edición ([`PatternModal`](../../services/frontend/src/components/patterns/PatternModal.js)).
5. **Scenarios** ([components/scenarios/](../../services/frontend/src/components/scenarios/)): CRUD de escenarios + activación. El componente [`SimulatorControls`](../../services/frontend/src/components/scenarios/SimulatorControls.js) muestra play/pause, sliders de rate y selectores de force_*.

## Flujo de datos

```
Mount App.js
  ├── useEffect → io(WS_URL) → socket.on('complex_event') → ++complexCount
  └── useEffect → setInterval(fetchDashboard, 5000)
                    └── Promise.all([
                          GET /api/events?limit=50,
                          GET /api/events/complex?grouped=true&since=60,
                          GET /api/stats/events-per-minute,
                          GET /api/patterns,
                          GET /api/stats/top-alerts,
                          GET /api/scenarios,
                          GET /api/simulator/config
                        ])
```

Cuando el usuario hace cambios:
- Activar/pausar simulador → `PUT /api/simulator/config { paused: true }` → la API purga colas → el simulador detecta el cambio en ≤1 s.
- Crear/editar patrón → `POST/PUT /api/patterns/...` → CEP recarga en ≤5 s.
- Activar escenario → `POST /api/scenarios/<id>/activate` → simulador adopta nuevos pesos en ≤1 s.

## Archivos importantes

| Archivo | Rol |
|---------|-----|
| [services/frontend/src/App.js](../../services/frontend/src/App.js) | Estado global, polling, conexión WebSocket, routing entre pestañas. **Punto único de orquestación.** |
| [services/frontend/src/index.js](../../services/frontend/src/index.js) | Bootstrap React. |
| [services/frontend/src/index.css](../../services/frontend/src/index.css) | Estilos globales (incluye tokens de severidad). |
| [services/frontend/src/utils/constants.js](../../services/frontend/src/utils/constants.js) | `API_URL`, `WS_URL`, listas de dominios/zonas/severidades, plantillas vacías de patrón y escenario. |
| [services/frontend/src/utils/format.js](../../services/frontend/src/utils/format.js) | Helpers de formato (fechas, números, severidad). |
| [services/frontend/src/utils/icons.js](../../services/frontend/src/utils/icons.js) | Mapas de iconos por dominio/severidad. |
| [services/frontend/src/components/dashboard/Dashboard.js](../../services/frontend/src/components/dashboard/Dashboard.js) | Pestaña principal, compone KPIs + chart + tablas. |
| [services/frontend/src/components/dashboard/EventRateChart.js](../../services/frontend/src/components/dashboard/EventRateChart.js) | Gráfico stacked por severidad usando Recharts. |
| [services/frontend/src/components/dashboard/KpiGrid.js](../../services/frontend/src/components/dashboard/KpiGrid.js) | Tarjetas de KPI agregados. |
| [services/frontend/src/components/dashboard/SimulatorStrip.js](../../services/frontend/src/components/dashboard/SimulatorStrip.js) | Tira con botón pause/play, rate y escenario activo. |
| [services/frontend/src/components/patterns/PatternsTab.js](../../services/frontend/src/components/patterns/PatternsTab.js) | Lista patrones, toggle enabled, abre modal. |
| [services/frontend/src/components/patterns/PatternModal.js](../../services/frontend/src/components/patterns/PatternModal.js) | Editor de patrón con modo formulario y modo JSON. |
| [services/frontend/src/components/scenarios/ScenariosTab.js](../../services/frontend/src/components/scenarios/ScenariosTab.js) | Lista escenarios, activar, clonar. |
| [services/frontend/src/components/scenarios/SimulatorControls.js](../../services/frontend/src/components/scenarios/SimulatorControls.js) | Controles avanzados del simulador (force_*). |
| [services/frontend/src/components/common/WsIndicator.js](../../services/frontend/src/components/common/WsIndicator.js) | Punto verde/gris según `wsConnected`. |
| [services/frontend/src/components/common/SeverityBadge.js](../../services/frontend/src/components/common/SeverityBadge.js) | Badge de color por severidad. |
| [services/frontend/Dockerfile](../../services/frontend/Dockerfile) | Build multi-stage Node → Nginx. Inyecta `REACT_APP_API_URL` y `REACT_APP_WEBSOCKET_URL` en `npm run build`. |
| [services/frontend/nginx.conf](../../services/frontend/nginx.conf) | Sirve la SPA. |
| [services/frontend/package.json](../../services/frontend/package.json) | Dependencias y scripts CRA. |

## Puntos a recordar

- **API_URL y WS_URL** se compilan en build-time vía args del Dockerfile (`REACT_APP_*`). Cambiar puerto del host requiere rebuild.
- El conteo de alertas (`complexCount`) se incrementa por evento Socket.IO **y** se re-sincroniza con el polling — evita drift si el WS se cae.
- El gráfico de eventos por minuto soporta 3 granularidades (10 s / 1 m / 5 m) que el usuario alterna; la API rellena buckets vacíos para que la línea no salte.
- El JSON-mode del modal de patrones permite editar la regla EPL directamente — útil para patrones complejos que el formulario no expresa bien.
