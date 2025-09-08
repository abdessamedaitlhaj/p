# Secure Development Patterns

This guide covers the secure coding patterns and security-first conventions used throughout the Pong platform. Understanding these security patterns will help you contribute effectively while maintaining the security posture of the codebase.

## 🔐 Security-First Pattern Categories

### 1. Secure Socket Event Patterns
### 2. Authenticated API Endpoint Patterns  
### 3. Secure Database Model Patterns
### 4. Input Validation Patterns
### 5. Authentication & Authorization Patterns
### 6. Error Handling (Security-Aware) Patterns

---

## 1. 🔌 Secure Socket Event Patterns

### Adding a New Secure Socket Event (Complete Workflow)

#### Step 1: Define Event in Secure Handler
**File**: `server/socket/secureHandlers.ts`

```typescript
// ALWAYS follow this security pattern for new events
socket.on('your_new_event', async (payload: unknown) => {
  try {
    // 1. CRITICAL: Get authenticated user from JWT middleware
    const userId = (socket as any).userId;  // From socketAuthMiddleware
    const userInfo = (socket as any).userInfo;
    
    if (!userId || !userInfo) {
      socket.emit('error', { message: 'Authentication required' });
      return;
    }
    
    // 2. VALIDATE: Always validate input with Zod schema
    const validatedPayload = YourEventSchema.parse(payload);
    
    // 3. RATE LIMIT: Check event-specific rate limiting
    if (!checkEventRateLimit(socket.id, 'your_new_event', 5, 60000)) {
      socket.emit('error', { message: 'Rate limit exceeded' });
      return;
    }
    
    // 4. AUTHORIZE: Check user can perform this action
    if (validatedPayload.targetUserId && validatedPayload.targetUserId !== userId) {
      socket.emit('error', { message: 'Unauthorized action' });
      return;
    }
    
    // 5. Check activity locks if needed
    if (activityManager.isUserLocked(userId).locked) {
      socket.emit('your_new_event_error', { message: 'User busy' });
      return;
    }
    
    // 6. Perform business logic with authenticated user
    const result = await performSecureLogic(validatedPayload, userId);
```
    
    // 5. Emit success response
    socket.emit('your_new_event_success', result);
    
    // 6. Broadcast to relevant users if needed
    app.io.to(userId).emit('your_new_event_update', result);
    
  } catch (error) {
    console.error('your_new_event error:', error);
    socket.emit('your_new_event_error', 'Operation failed');
  }
});
```

#### Step 2: Add Frontend Event Handling
**Pattern for React Hooks** (`client/hooks/useYourFeature.ts`):

```typescript
export const useYourFeature = () => {
  const [state, setState] = useState<YourStateType>(initialState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (!socket) return;
    
    // Success handler
    const handleSuccess = (data: any) => {
      setState(data);
      setLoading(false);
      setError(null);
    };
    
    // Error handler
    const handleError = (message: string) => {
      setError(message);
      setLoading(false);
    };
    
    // Update handler
    const handleUpdate = (data: any) => {
      setState(prev => ({ ...prev, ...data }));
    };
    
    // Register listeners
    socket.on('your_new_event_success', handleSuccess);
    socket.on('your_new_event_error', handleError);
    socket.on('your_new_event_update', handleUpdate);
    
    // Cleanup on unmount
    return () => {
      socket.off('your_new_event_success', handleSuccess);
      socket.off('your_new_event_error', handleError);
      socket.off('your_new_event_update', handleUpdate);
    };
  }, [socket]);
  
  // Action function
  const triggerAction = useCallback((payload: YourPayloadType) => {
    if (!socket) return;
    
    setLoading(true);
    setError(null);
    socket.emit('your_new_event', payload);
  }, [socket]);
  
  return {
    state,
    loading,
    error,
    triggerAction
  };
};
```

#### Step 3: Add Zustand Store Integration (if global state needed)
**Pattern for Store Slices** (`client/store/slices/yourFeatureSlice.ts`):

```typescript
export interface YourFeatureState {
  items: YourItemType[];
  currentItem: YourItemType | null;
  loading: boolean;
  error: string | null;
}

export interface YourFeatureActions {
  setItems: (items: YourItemType[]) => void;
  setCurrentItem: (item: YourItemType | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const createYourFeatureSlice: StateCreator<
  RootState,
  [],
  [],
  YourFeatureState & YourFeatureActions
> = (set) => ({
  // Initial state
  items: [],
  currentItem: null,
  loading: false,
  error: null,
  
  // Actions
  setItems: (items) => set({ items }),
  setCurrentItem: (currentItem) => set({ currentItem }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  reset: () => set({
    items: [],
    currentItem: null,
    loading: false,
    error: null
  }),
});
```

---

## 2. 🌐 API Endpoint Patterns

### Adding a New REST API Endpoint

#### Step 1: Create Controller Function
**File**: `server/controllers/yourController.ts`

```typescript
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AuthenticatedRequest } from '../middleware/verifyToken';

interface YourRequestBody {
  field1: string;
  field2: number;
}

interface YourQueryParams {
  limit?: string;
  offset?: string;
}

export async function handleYourEndpoint(
  request: FastifyRequest<{
    Body: YourRequestBody;
    Querystring: YourQueryParams;
  }>,
  reply: FastifyReply
): Promise<void> {
  try {
    // 1. Extract and validate parameters
    const { field1, field2 } = request.body;
    const limit = parseInt(request.query.limit || '10');
    const offset = parseInt(request.query.offset || '0');
    
    // 2. Validate required fields
    if (!field1) {
      return reply.code(400).send({
        error: 'field1 is required',
        code: 'MISSING_FIELD1'
      });
    }
    
    if (typeof field2 !== 'number' || field2 < 0) {
      return reply.code(400).send({
        error: 'field2 must be a positive number',
        code: 'INVALID_FIELD2'
      });
    }
    
    // 3. Perform business logic
    const result = await performYourBusinessLogic({
      field1,
      field2,
      limit,
      offset
    });
    
    // 4. Return success response
    return reply.code(200).send({
      success: true,
      data: result,
      pagination: {
        limit,
        offset,
        total: result.length
      }
    });
    
  } catch (error) {
    console.error('handleYourEndpoint error:', error);
    return reply.code(500).send({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
}

// For authenticated endpoints, use AuthenticatedRequest
export async function handleAuthenticatedEndpoint(
  request: AuthenticatedRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // User is available as request.user
    const userId = request.user.id;
    
    // Your authenticated logic here
    const result = await performAuthenticatedLogic(userId);
    
    return reply.code(200).send({
      success: true,
      data: result
    });
    
  } catch (error) {
    console.error('handleAuthenticatedEndpoint error:', error);
    return reply.code(500).send({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
}
```

#### Step 2: Register Route
**File**: `server/routes/yourRoutes.ts`

```typescript
import type { FastifyInstance } from 'fastify';
import { verifyToken } from '../middleware/verifyToken';
import { handleYourEndpoint, handleAuthenticatedEndpoint } from '../controllers/yourController';

export async function YourRoutes(app: FastifyInstance) {
  // Public endpoint
  app.post('/your-endpoint', {
    schema: {
      body: {
        type: 'object',
        required: ['field1', 'field2'],
        properties: {
          field1: { type: 'string', minLength: 1 },
          field2: { type: 'number', minimum: 0 }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'string' },
          offset: { type: 'string' }
        }
      }
    }
  }, handleYourEndpoint);
  
  // Authenticated endpoint
  app.get('/your-protected-endpoint', {
    preHandler: [verifyToken],
    schema: {
      headers: {
        type: 'object',
        properties: {
          authorization: { type: 'string' }
        },
        required: ['authorization']
      }
    }
  }, handleAuthenticatedEndpoint);
}
```

#### Step 3: Register in Main Server
**File**: `server/index.ts`

```typescript
// Add this import
import { YourRoutes } from './routes/yourRoutes';

// Add this registration in createServer()
await app.register(YourRoutes, { prefix: 'api/your-feature' });
```

#### Step 4: Frontend API Client
**Pattern for API calls** (`client/api/yourApi.ts`):

```typescript
import { axiosInstance } from '../utils/Axios';

export interface YourApiRequest {
  field1: string;
  field2: number;
}

export interface YourApiResponse {
  success: boolean;
  data: any;
  pagination?: {
    limit: number;
    offset: number;
    total: number;
  };
}

export const yourApi = {
  // POST request
  create: async (data: YourApiRequest): Promise<YourApiResponse> => {
    const response = await axiosInstance.post('/api/your-feature/your-endpoint', data);
    return response.data;
  },
  
  // GET request with query params
  list: async (params?: { limit?: number; offset?: number }): Promise<YourApiResponse> => {
    const response = await axiosInstance.get('/api/your-feature/your-protected-endpoint', {
      params
    });
    return response.data;
  },
  
  // Error handling wrapper
  safeCall: async <T>(apiCall: () => Promise<T>): Promise<{ data?: T; error?: string }> => {
    try {
      const data = await apiCall();
      return { data };
    } catch (error: any) {
      const message = error.response?.data?.error || 'Unknown error';
      return { error: message };
    }
  }
};
```

---

## 3. 🗄️ Database Model Patterns

### Adding a New Database Model

#### Step 1: Create Model File
**File**: `server/models/YourModel.ts`

```typescript
import { db } from '../db/db';
import type { Database } from 'sqlite3';

export interface YourModel {
  id: number;
  name: string;
  value: number;
  user_id: number;
  created_at: Date;
  updated_at: Date;
}

export class YourModelClass {
  constructor(private db: Database) {
    // Create table on instantiation
    this.createTable();
  }
  
  private createTable(): void {
    const sql = `
      CREATE TABLE IF NOT EXISTS your_models (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        value INTEGER NOT NULL DEFAULT 0,
        user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `;
    
    this.db.exec(sql, (err) => {
      if (err) {
        console.error('Error creating your_models table:', err);
      } else {
        console.log('✅ your_models table ready');
      }
    });
  }
  
  // CREATE
  async create(data: Omit<YourModel, 'id' | 'created_at' | 'updated_at'>): Promise<YourModel> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO your_models (name, value, user_id)
        VALUES (?, ?, ?)
      `;
      
      this.db.run(sql, [data.name, data.value, data.user_id], function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        // Get the created record
        const selectSql = 'SELECT * FROM your_models WHERE id = ?';
        db.get(selectSql, [this.lastID], (err, row: any) => {
          if (err) reject(err);
          else resolve(row as YourModel);
        });
      });
    });
  }
  
  // READ
  async getById(id: number): Promise<YourModel | null> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM your_models WHERE id = ?';
      
      this.db.get(sql, [id], (err, row: any) => {
        if (err) reject(err);
        else resolve(row as YourModel || null);
      });
    });
  }
  
  async getByUserId(userId: number): Promise<YourModel[]> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM your_models WHERE user_id = ? ORDER BY created_at DESC';
      
      this.db.all(sql, [userId], (err, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows as YourModel[]);
      });
    });
  }
  
  // UPDATE
  async update(id: number, data: Partial<Omit<YourModel, 'id' | 'created_at'>>): Promise<YourModel | null> {
    return new Promise((resolve, reject) => {
      const fields = Object.keys(data).map(key => `${key} = ?`).join(', ');
      const values = Object.values(data);
      
      const sql = `
        UPDATE your_models 
        SET ${fields}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      this.db.run(sql, [...values, id], function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        if (this.changes === 0) {
          resolve(null);
          return;
        }
        
        // Get updated record
        const selectSql = 'SELECT * FROM your_models WHERE id = ?';
        db.get(selectSql, [id], (err, row: any) => {
          if (err) reject(err);
          else resolve(row as YourModel);
        });
      });
    });
  }
  
  // DELETE
  async delete(id: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM your_models WHERE id = ?';
      
      this.db.run(sql, [id], function(err) {
        if (err) reject(err);
        else resolve(this.changes > 0);
      });
    });
  }
  
  // UTILITY METHODS
  async count(userId?: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const sql = userId 
        ? 'SELECT COUNT(*) as count FROM your_models WHERE user_id = ?'
        : 'SELECT COUNT(*) as count FROM your_models';
      
      const params = userId ? [userId] : [];
      
      this.db.get(sql, params, (err, row: any) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
  }
}

// Export singleton instance
export const yourModelInstance = new YourModelClass(db);
```

#### Step 2: Add Model to Database Initialization
**File**: `server/db/db.ts`

```typescript
// Add this import
import { yourModelInstance } from '../models/YourModel';

// The model will automatically create its table when imported
// No additional setup needed if following the constructor pattern
```

---

## 4. ⚛️ React Component Patterns

### Standard Component Structure

```typescript
// File: client/components/YourComponent.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { useYourFeature } from '../hooks/useYourFeature';

interface YourComponentProps {
  id: string;
  title: string;
  onAction?: (data: any) => void;
  className?: string;
}

interface YourComponentState {
  localData: any[];
  selectedItem: any | null;
  isEditing: boolean;
}

const YourComponent: React.FC<YourComponentProps> = ({
  id,
  title,
  onAction,
  className = ''
}) => {
  // 1. Local state
  const [state, setState] = useState<YourComponentState>({
    localData: [],
    selectedItem: null,
    isEditing: false
  });
  
  // 2. Global state
  const globalData = useStore(state => state.yourFeature.items);
  const setGlobalData = useStore(state => state.yourFeature.setItems);
  
  // 3. Custom hooks
  const { loading, error, triggerAction } = useYourFeature();
  
  // 4. Computed values
  const filteredData = globalData.filter(item => item.category === 'active');
  const hasData = filteredData.length > 0;
  
  // 5. Event handlers
  const handleItemClick = useCallback((item: any) => {
    setState(prev => ({ ...prev, selectedItem: item }));
    onAction?.(item);
  }, [onAction]);
  
  const handleSubmit = useCallback(async (formData: any) => {
    try {
      setState(prev => ({ ...prev, isEditing: false }));
      await triggerAction(formData);
    } catch (error) {
      console.error('Submit error:', error);
    }
  }, [triggerAction]);
  
  // 6. Effects
  useEffect(() => {
    if (globalData.length === 0) {
      // Load initial data
      triggerAction({ type: 'LOAD_INITIAL' });
    }
  }, [globalData.length, triggerAction]);
  
  // 7. Loading and error states
  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading...</span>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded p-4">
        <p className="text-red-800">Error: {error}</p>
        <button 
          onClick={() => triggerAction({ type: 'RETRY' })}
          className="mt-2 px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }
  
  // 8. Main render
  return (
    <div className={`your-component ${className}`}>
      <header className="mb-4">
        <h2 className="text-xl font-semibold">{title}</h2>
      </header>
      
      <main>
        {hasData ? (
          <div className="grid gap-4">
            {filteredData.map(item => (
              <div 
                key={item.id}
                onClick={() => handleItemClick(item)}
                className="p-3 border rounded cursor-pointer hover:bg-gray-50"
              >
                <h3 className="font-medium">{item.name}</h3>
                <p className="text-gray-600">{item.description}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p>No items found</p>
            <button 
              onClick={() => setState(prev => ({ ...prev, isEditing: true }))}
              className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Add First Item
            </button>
          </div>
        )}
      </main>
      
      {/* Conditional rendering */}
      {state.isEditing && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Edit Item</h3>
            {/* Your form component here */}
            <div className="flex gap-2 justify-end mt-4">
              <button 
                onClick={() => setState(prev => ({ ...prev, isEditing: false }))}
                className="px-3 py-2 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleSubmit({})}
                className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default YourComponent;
```

---

## 5. 📊 State Management Patterns

### Zustand Store Pattern

```typescript
// File: client/store/slices/yourSlice.ts
import { StateCreator } from 'zustand';
import type { RootState } from '../createRootStore';

export interface YourState {
  // Data
  items: YourItem[];
  currentItem: YourItem | null;
  filters: YourFilters;
  
  // UI State
  loading: boolean;
  error: string | null;
  isModalOpen: boolean;
  
  // Pagination
  page: number;
  limit: number;
  total: number;
}

export interface YourActions {
  // Data actions
  setItems: (items: YourItem[]) => void;
  addItem: (item: YourItem) => void;
  updateItem: (id: string, updates: Partial<YourItem>) => void;
  removeItem: (id: string) => void;
  setCurrentItem: (item: YourItem | null) => void;
  
  // Filter actions
  setFilters: (filters: Partial<YourFilters>) => void;
  resetFilters: () => void;
  
  // UI actions
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setModalOpen: (open: boolean) => void;
  
  // Pagination actions
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  setTotal: (total: number) => void;
  
  // Computed getters
  getFilteredItems: () => YourItem[];
  getCurrentPageItems: () => YourItem[];
  
  // Reset
  reset: () => void;
}

const initialState: YourState = {
  items: [],
  currentItem: null,
  filters: { category: 'all', status: 'active' },
  loading: false,
  error: null,
  isModalOpen: false,
  page: 1,
  limit: 10,
  total: 0,
};

export const createYourSlice: StateCreator<
  RootState,
  [],
  [],
  YourState & YourActions
> = (set, get) => ({
  // Initial state
  ...initialState,
  
  // Data actions
  setItems: (items) => set({ items }),
  
  addItem: (item) => set((state) => ({ 
    items: [...state.items, item],
    total: state.total + 1
  })),
  
  updateItem: (id, updates) => set((state) => ({
    items: state.items.map(item => 
      item.id === id ? { ...item, ...updates } : item
    )
  })),
  
  removeItem: (id) => set((state) => ({
    items: state.items.filter(item => item.id !== id),
    total: Math.max(0, state.total - 1),
    currentItem: state.currentItem?.id === id ? null : state.currentItem
  })),
  
  setCurrentItem: (currentItem) => set({ currentItem }),
  
  // Filter actions
  setFilters: (filters) => set((state) => ({ 
    filters: { ...state.filters, ...filters },
    page: 1 // Reset to first page when filtering
  })),
  
  resetFilters: () => set({ 
    filters: initialState.filters,
    page: 1
  }),
  
  // UI actions
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setModalOpen: (isModalOpen) => set({ isModalOpen }),
  
  // Pagination actions
  setPage: (page) => set({ page }),
  setLimit: (limit) => set({ limit, page: 1 }),
  setTotal: (total) => set({ total }),
  
  // Computed getters
  getFilteredItems: () => {
    const { items, filters } = get();
    return items.filter(item => {
      if (filters.category !== 'all' && item.category !== filters.category) {
        return false;
      }
      if (filters.status !== 'all' && item.status !== filters.status) {
        return false;
      }
      return true;
    });
  },
  
  getCurrentPageItems: () => {
    const { page, limit } = get();
    const filteredItems = get().getFilteredItems();
    const startIndex = (page - 1) * limit;
    return filteredItems.slice(startIndex, startIndex + limit);
  },
  
  // Reset
  reset: () => set(initialState),
});
```

### Authentication State Synchronization Pattern

**Problem**: Race condition between React Context and Zustand store during token refresh on direct page access.

**When to use**: Any authentication flow that needs to synchronize dual state management systems.

```typescript
// File: client/hooks/useRefreshToken.ts
import { useStore } from '../store/useStore';

const useRefreshToken = () => {
    const {dispatch} = useAuth()
    const { setUser, connect } = useStore(); // ✅ Get store actions

    const refresh = async()=>{
        try{
            const {data} = await api.get('token/new', {withCredentials: true})
            
            // ✅ Update React Context state
            dispatch({type:'Persist_Login', payload:data})
            
            // 🔥 CRITICAL: Also initialize Zustand store immediately
            // This prevents null access errors on direct page access
            if (data?.user) {
                const userWithStringId = {
                    ...data.user,
                    id: String(data.user.id)
                };
                setUser(userWithStringId);        // Initialize user state
                connect("http://localhost:3000"); // Initialize socket connection
            }
            
            return data
        }catch(err){
            console.error(err)
        }
    }
    return refresh
}
```

**Why this pattern is necessary**:

1. **Direct Page Access Issue**: When user refreshes `/chat` or accesses it directly:
   - `PersistLogin` calls `refreshToken()`
   - Only React Context state gets updated initially
   - Components render before Context useEffect can sync to Zustand
   - Result: `Cannot read properties of null (reading 'id')` errors

2. **Navigation Works**: When navigating from home → chat:
   - Authentication already established
   - Both state systems already synchronized
   - No race condition occurs

**Defensive Component Pattern**:
```typescript
// Always add null checks for store data that might not be ready
const filteredUsers = data?.filter((u) => 
  user?.id && String(u.id) !== String(user.id)
  //  ^^^^^ Critical null check
);

// Alternative: Early return pattern
const MyComponent = () => {
  const { user, socket } = useStore();
  
  // ✅ Guard against null states during initialization
  if (!user || !socket) {
    return <div>Loading...</div>;
  }
  
  // Safe to use user and socket here
  return <div>{user.username}</div>;
};
```

**Key Takeaways**:
- Always initialize both React Context and Zustand stores simultaneously in auth flows
- Add null safety checks in components that depend on authenticated user data  
- Consider loading states for components that need fully initialized state
- Test direct page access scenarios, not just navigation flows

---

## 6. 🚨 Error Handling Patterns

### Backend Error Handling

```typescript
// Consistent error response format
interface ErrorResponse {
  error: string;           // Human-readable message
  code: string;            // Machine-readable code
  details?: any;           // Additional context
  timestamp?: string;      // When error occurred
}

// Error handling wrapper for controllers
export const withErrorHandling = (
  handler: (req: any, reply: any) => Promise<void>
) => {
  return async (request: any, reply: any) => {
    try {
      await handler(request, reply);
    } catch (error: any) {
      console.error('Controller error:', error);
      
      // Database constraint errors
      if (error.code === 'SQLITE_CONSTRAINT') {
        return reply.code(409).send({
          error: 'Resource conflict',
          code: 'CONSTRAINT_VIOLATION',
          details: error.message
        });
      }
      
      // Validation errors
      if (error.name === 'ValidationError') {
        return reply.code(400).send({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: error.details
        });
      }
      
      // Authentication errors
      if (error.name === 'UnauthorizedError') {
        return reply.code(401).send({
          error: 'Authentication required',
          code: 'UNAUTHORIZED'
        });
      }
      
      // Default server error
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        timestamp: new Date().toISOString()
      });
    }
  };
};
```

### Frontend Error Handling

```typescript
// Error boundary component
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ComponentType<{error: Error}> },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error boundary caught:', error, errorInfo);
  }
  
  render() {
    if (this.state.hasError) {
      const FallbackComponent = this.props.fallback || DefaultErrorFallback;
      return <FallbackComponent error={this.state.error!} />;
    }
    
    return this.props.children;
  }
}

// API error handling
export const handleApiError = (error: any): string => {
  if (error.response?.data?.error) {
    return error.response.data.error;
  }
  
  if (error.message) {
    return error.message;
  }
  
  return 'An unexpected error occurred';
};

// Hook for error handling
export const useErrorHandler = () => {
  const [error, setError] = useState<string | null>(null);
  
  const handleError = useCallback((err: any) => {
    const message = handleApiError(err);
    setError(message);
    
    // Optional: Send to error tracking service
    console.error('Error:', err);
  }, []);
  
  const clearError = useCallback(() => {
    setError(null);
  }, []);
  
  return { error, handleError, clearError };
};
```

## 🎯 Quick Reference

### Common File Locations
- Socket events: `server/socket/registerHandlers.ts`
- API routes: `server/routes/`
- Controllers: `server/controllers/`
- Database models: `server/models/`
- React components: `client/components/`
- Custom hooks: `client/hooks/`
- Zustand stores: `client/store/slices/`
- Types: `client/types/types.ts` and `server/types.ts`

### Naming Conventions
- **Files**: `camelCase.ts` for utilities, `PascalCase.tsx` for components
- **Interfaces**: `PascalCase` (e.g., `GameState`, `UserProfile`)
- **Functions**: `camelCase` (e.g., `getUserById`, `handleSubmit`)
- **Components**: `PascalCase` (e.g., `GameBoard`, `UserProfile`)
- **Socket events**: `snake_case` (e.g., `game_start`, `user_join`)
- **Database tables**: `snake_case` (e.g., `user_sessions`, `game_results`)

### Testing Patterns
```typescript
// Always test the happy path and error cases
describe('YourFeature', () => {
  test('should handle valid input', async () => {
    // Setup
    const validInput = { field: 'value' };
    
    // Execute
    const result = await yourFunction(validInput);
    
    // Verify
    expect(result).toEqual(expectedOutput);
  });
  
  test('should handle invalid input', async () => {
    // Setup
    const invalidInput = { field: null };
    
    // Execute & Verify
    await expect(yourFunction(invalidInput)).rejects.toThrow('Validation error');
  });
});
```

By following these patterns consistently, you'll maintain code quality and make it easier for other developers to understand and contribute to the codebase.
