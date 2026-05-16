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
  async (id: number, { rejectWithValue }) => {
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
  async (data: { case_name: string; case_type: string; summary?: string }, { rejectWithValue }) => {
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
  async (id: number, { rejectWithValue }) => {
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
    updateCaseProgress: (state, action) => {
      const { case_id, progress, status, message, case_name, summary,
              complainant, respondent, project_info, complaint_items } = action.payload;
      const caseItem = state.cases.find(c => c.id === case_id);
      if (caseItem) {
        caseItem.progress = progress;
        caseItem.status = status;
        if (message !== undefined) {
          caseItem.processing_message = message;
        }
        if (case_name !== undefined) {
          caseItem.case_name = case_name;
        }
        if (summary !== undefined) {
          caseItem.summary = summary;
        }
        if (complainant !== undefined) {
          caseItem.complainant = complainant;
        }
        if (respondent !== undefined) {
          caseItem.respondent = respondent;
        }
        if (project_info !== undefined) {
          caseItem.project_info = project_info;
        }
        if (complaint_items !== undefined) {
          caseItem.complaint_items = complaint_items;
        }
      }
      if (state.currentCase && state.currentCase.id === case_id) {
        if (complainant !== undefined) state.currentCase.complainant = complainant;
        if (respondent !== undefined) state.currentCase.respondent = respondent;
        if (project_info !== undefined) state.currentCase.project_info = project_info;
        if (complaint_items !== undefined) state.currentCase.complaint_items = complaint_items;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCases.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchCases.fulfilled, (state, action) => {
        state.cases = action.payload.items || action.payload;
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
        state.cases = state.cases.filter(c => c.id !== action.payload);
      });
  },
});

export const { clearCurrentCase, clearError, updateCaseProgress } = caseSlice.actions;
export default caseSlice.reducer;
