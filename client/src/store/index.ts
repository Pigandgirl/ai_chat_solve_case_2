import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import caseReducer from './slices/caseSlice';

const store = configureStore({
  reducer: {
    auth: authReducer,
    case: caseReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export default store;