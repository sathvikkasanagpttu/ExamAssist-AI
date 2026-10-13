import { z } from "zod";
import {
  APP_VERSION,
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
  AssessmentAnalyzeRequestSchema,
  AssessmentResponseSchema,
  CodeAnalyzeRequestSchema,
  CodeDebugRequestSchema,
  CodeHintRequestSchema,
  CodeExplainRequestSchema,
  CodeComplexityRequestSchema,
  VisionExtractRequestSchema,
  ExtractedQuestionPayloadSchema,
  ExtensionMessageSchema,
  LegacyActionMessageSchema,
  RuntimeMessageEnvelopeSchema,
  StreamingEventSchema
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
export type AssessmentAnalyzeRequest = z.infer<typeof AssessmentAnalyzeRequestSchema>;
export type AssessmentResponse = z.infer<typeof AssessmentResponseSchema>;
export type CodeAnalyzeRequest = z.infer<typeof CodeAnalyzeRequestSchema>;
export type CodeDebugRequest = z.infer<typeof CodeDebugRequestSchema>;
export type CodeHintRequest = z.infer<typeof CodeHintRequestSchema>;
export type CodeExplainRequest = z.infer<typeof CodeExplainRequestSchema>;
export type CodeComplexityRequest = z.infer<typeof CodeComplexityRequestSchema>;
export type VisionExtractRequest = z.infer<typeof VisionExtractRequestSchema>;
export type ExtractedQuestionPayload = z.infer<typeof ExtractedQuestionPayloadSchema>;
export type ExtensionMessage = z.infer<typeof ExtensionMessageSchema>;
export type LegacyActionMessage = z.infer<typeof LegacyActionMessageSchema>;
export type RuntimeMessageEnvelope = z.infer<typeof RuntimeMessageEnvelopeSchema>;
export type StreamingEvent = z.infer<typeof StreamingEventSchema>;

export {
  APP_VERSION,
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
  AssessmentAnalyzeRequestSchema,
  AssessmentResponseSchema,
  CodeAnalyzeRequestSchema,
  CodeDebugRequestSchema,
  CodeHintRequestSchema,
  CodeExplainRequestSchema,
  CodeComplexityRequestSchema,
  VisionExtractRequestSchema,
  ExtractedQuestionPayloadSchema,
  ExtensionMessageSchema,
  LegacyActionMessageSchema,
  RuntimeMessageEnvelopeSchema,
  StreamingEventSchema
};
