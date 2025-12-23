# Zero-SPA Admin Console - Module Dependencies

This diagram shows how modules depend on each other in the refactored architecture.

```
┌─────────────────────────────────────────────────────────────────┐
│                          index.js                                │
│                    (Main Entry Point)                            │
│  - Initializes Express app                                       │
│  - Applies middleware                                            │
│  - Mounts routes                                                 │
└────┬─────────────────┬──────────────────┬─────────────────┬─────┘
     │                 │                  │                 │
     ▼                 ▼                  ▼                 ▼
┌─────────┐    ┌──────────────┐   ┌─────────────┐   ┌─────────────┐
│ config/ │    │ middleware/  │   │  routes/    │   │   public/   │
└────┬────┘    └──────┬───────┘   └──────┬──────┘   └─────────────┘
     │                │                   │
     │                │                   │
     └────────────────┴───────────────────┘
                      │
         ┌────────────┼────────────┐
         ▼            ▼            ▼
    ┌─────────┐  ┌─────────┐  ┌────────┐
    │services/│  │ utils/  │  │ config/│
    └─────────┘  └─────────┘  └────────┘
```

## Detailed Dependencies

### index.js (Entry Point)
- **Imports from**:
  - `config/` → Configuration
  - `middleware/auth.js` → Basic auth middleware
  - `routes/auth.js` → Authentication routes
  - `routes/assets.js` → Asset management routes
  - `routes/policies.js` → Policy management routes
  - `routes/network.js` → Network/SPA routes
  - `routes/users.js` → User management routes
  - `routes/status.js` → Status/health routes

### Config Layer
**config/index.js**
- **Dependencies**: None (pure configuration)
- **Exports**: All environment variables and constants
- **Used by**: All other modules

### Middleware Layer
**middleware/auth.js**
- **Imports**: `services/jwt.js`, `config/`
- **Exports**: `verifyJwtMiddleware`, `authMiddleware`, `maskSensitiveHeaders`

**middleware/rateLimit.js**
- **Imports**: None
- **Exports**: `authRateLimiter`

**middleware/validation.js**
- **Imports**: None
- **Exports**: `InputValidator` object

### Services Layer
**services/jwt.js**
- **Imports**: `config/`
- **Exports**: `generateJWT`, `verifyJWT`

**services/sas.js**
- **Imports**: `config/`, `utils/xml.js`, `utils/storage.js`
- **Exports**: SAS SOAP API functions, user caching

**services/bsidca.js**
- **Imports**: `config/`, `utils/xml.js`
- **Exports**: BSIDCA SOAP API functions

### Utils Layer
**utils/xml.js**
- **Imports**: None
- **Exports**: XML parsing and escaping functions

**utils/storage.js**
- **Imports**: `config/`
- **Exports**: File I/O functions

**utils/audit.js**
- **Imports**: `config/`, `utils/storage.js`
- **Exports**: `logAudit` function

### Routes Layer
**routes/auth.js**
- **Imports**: `middleware/auth.js`, `middleware/rateLimit.js`, `middleware/validation.js`, `services/jwt.js`, `services/sas.js`, `utils/audit.js`
- **Exports**: Express router

**routes/assets.js**
- **Imports**: `middleware/auth.js`, `middleware/validation.js`, `config/`, `utils/storage.js`
- **Exports**: Express router

**routes/policies.js**
- **Imports**: `middleware/auth.js`, `middleware/validation.js`, `config/`, `utils/storage.js`
- **Exports**: Express router

**routes/network.js**
- **Imports**: `middleware/auth.js`, `middleware/validation.js`, `config/`, `utils/storage.js`, `utils/audit.js`
- **Exports**: Express router

**routes/users.js**
- **Imports**: `config/`, `middleware/auth.js`, `utils/xml.js`, `utils/storage.js`, `services/sas.js`, `services/bsidca.js`
- **Exports**: Express router

**routes/status.js**
- **Imports**: `config/`, `utils/storage.js`, `services/sas.js`
- **Exports**: Express router

## Dependency Graph (Bottom-Up)

```
Level 0 (No dependencies):
├── config/index.js
├── middleware/validation.js
├── middleware/rateLimit.js
└── utils/xml.js

Level 1 (Depends on Level 0):
├── utils/storage.js          → config
├── services/jwt.js           → config
└── services/bsidca.js        → config, utils/xml

Level 2 (Depends on Level 0-1):
├── middleware/auth.js        → config, services/jwt
├── utils/audit.js            → config, utils/storage
└── services/sas.js           → config, utils/xml, utils/storage

Level 3 (Depends on Level 0-2):
├── routes/auth.js            → middleware/*, services/*, utils/audit
├── routes/assets.js          → middleware/*, config, utils/storage
├── routes/policies.js        → middleware/*, config, utils/storage
├── routes/network.js         → middleware/*, config, utils/*, child_process
├── routes/users.js           → config, middleware/auth, utils/*, services/*
└── routes/status.js          → config, utils/storage, services/sas

Level 4 (Entry Point):
└── index.js                  → config, middleware/auth, routes/*
```

## Key Design Principles

1. **Unidirectional Dependencies**: Dependencies flow downward/inward
2. **Layered Architecture**: Clear separation between layers
3. **No Circular Dependencies**: Each module has a clear dependency chain
4. **Single Responsibility**: Each module has one clear purpose
5. **Loose Coupling**: Modules interact through well-defined interfaces

## Testing Strategy

Based on the dependency graph, test in this order:

1. **Unit Tests** (Level 0): config, validation, xml
2. **Unit Tests** (Level 1): storage, jwt, bsidca
3. **Unit Tests** (Level 2): auth middleware, audit, sas
4. **Integration Tests** (Level 3): All routes
5. **E2E Tests** (Level 4): Full application via index.js

---

**Architecture Type**: Layered + Modular
**Total Modules**: 16
**Max Dependency Depth**: 4 levels
**Circular Dependencies**: 0
