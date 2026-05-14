import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { CaseItem } from '../../types';
import { caseAPI } from '../../api';

interface CaseState {
  cases: CaseItem[];
  currentCase: CaseItem | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: CaseState = {
  cases: [],
  currentCase: null,
  isLoading: false,
  error: null,
};

export const fetchCases = createAsyncThunk(
  'case/fetchCases',
  async (params: Parameters<typeof caseAPI.getCases>[0] = {}, thunkAPI) => {
    try {
      const response = await caseAPI.getCases(params);
      return response.data;
    } catch (error: any) {
      return thunkAPI.rejectWithValue(error.response?.data?.message || '获取案件列表失败');
    }
  }
);

export const fetchCaseById = createAsyncThunk(
  'case/fetchCaseById',
  async (id: string, { rejectWithValue }) => {
    try {
      const response = await caseAPI.getCaseById(id);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '获取案件详情失败');
    }
  }
);

export const createCase = createAsyncThunk(
  'case/createCase',
  async (data: { caseName: string; caseType: string; summary?: string }, { rejectWithValue }) => {
    try {
      const response = await caseAPI.createCase(data);
      return response.data.case;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '创建案件失败');
    }
  }
);

export const deleteCase = createAsyncThunk(
  'case/deleteCase',
  async (id: string, { rejectWithValue }) => {
    try {
      await caseAPI.deleteCase(id);
      return id;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '删除案件失败');
    }
  }
);

const caseSlice = createSlice({
  name: 'case',
  initialState,
  reducers: {
    clearCurrentCase: (state) => {
      state.currentCase = null;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCases.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchCases.fulfilled, (state, action) => {
        state.cases = action.payload;
        state.isLoading = false;
        state.error = null;
      })
      .addCase(fetchCases.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(fetchCaseById.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchCaseById.fulfilled, (state, action) => {
        state.currentCase = action.payload;
        state.isLoading = false;
        state.error = null;
      })
      .addCase(fetchCaseById.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(createCase.fulfilled, (state, action) => {
        state.cases.unshift(action.payload);
      })
      .addCase(deleteCase.fulfilled, (state, action) => {
        state.cases = state.cases.filter(c => c._id !== action.payload);
      });
  },
});

export const { clearCurrentCase, clearError } = caseSlice.actions;
export default caseSlice.reducer;