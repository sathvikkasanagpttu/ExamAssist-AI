import { z } from "zod";
import {
  QuestionTypeEnum,
  CodingQuestionSubTypeEnum,
  DifficultyEnum,
  ConfidenceEnum,
  VerificationStatusEnum,
  QuestionQualityStatusEnum,
  ExplanationLevelEnum,
  SupportedCodeLanguageEnum,
  SampleTestCaseSchema,
  ExtractedEditorStateSchema,
  ExtractedCodingProblemSchema,
  CodeAnalyzeRequestSchema,
  CodeDebugRequestSchema,
  CodeHintRequestSchema,
  CodeExplainRequestSchema,
  CodeComplexityRequestSchema
} from "./schemas.js";

export type QuestionType = z.infer<typeof QuestionTypeEnum>;
export type CodingQuestionSubType = z.infer<typeof CodingQuestionSubTypeEnum>;
export type Difficulty = z.infer<typeof DifficultyEnum>;
export type Confidence = z.infer<typeof ConfidenceEnum>;
export type VerificationStatus = z.infer<typeof VerificationStatusEnum>;
export type QuestionQualityStatus = z.infer<typeof QuestionQualityStatusEnum>;
export type ExplanationLevel = z.infer<typeof ExplanationLevelEnum>;
export type SupportedCodeLanguage = z.infer<typeof SupportedCodeLanguageEnum>;
export type SampleTestCase = z.infer<typeof SampleTestCaseSchema>;
export type ExtractedEditorState = z.infer<typeof ExtractedEditorStateSchema>;
export type ExtractedCodingProblem = z.infer<typeof ExtractedCodingProblemSchema>;
export type CodeAnalyzeRequest = z.infer<typeof CodeAnalyzeRequestSchema>;
export type CodeDebugRequest = z.infer<typeof CodeDebugRequestSchema>;
export type CodeHintRequest = z.infer<typeof CodeHintRequestSchema>;
export type CodeExplainRequest = z.infer<typeof CodeExplainRequestSchema>;
export type CodeComplexityRequest = z.infer<typeof CodeComplexityRequestSchema>;

export {
  QuestionTypeEnum,
  CodingQuestionSubTypeEnum,
  DifficultyEnum,
  ConfidenceEnum,
  VerificationStatusEnum,
  QuestionQualityStatusEnum,
  ExplanationLevelEnum,
  SupportedCodeLanguageEnum,
  SampleTestCaseSchema,
  ExtractedEditorStateSchema,
  ExtractedCodingProblemSchema,
  CodeAnalyzeRequestSchema,
  CodeDebugRequestSchema,
  CodeHintRequestSchema,
  CodeExplainRequestSchema,
  CodeComplexityRequestSchema
};
