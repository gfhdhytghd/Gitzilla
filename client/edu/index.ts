// Edu mode (classroom PvP): lesson engine + concept library + UI components that claude-ui mounts.
// Mount guide: docs/progress/claude-edu.md.
export { CONCEPTS, ALL_CONCEPTS, STAT_CONCEPT, STAT_LABEL, conceptForAttack, conceptInfo, factLine, type EduConcept, type Facts } from "./concepts.ts";
export { LessonEngine, type Lesson, type EduContext } from "./engine.ts";
export { createLessonFeed, lessonCard, type LessonFeed, type EduVariant } from "./feed.ts";
export { createQuizOverlay, quizView, padLetters, PAD_COLORS, type QuizOverlay } from "./quiz.ts";
export { createReportCard, createClassReport, createArchitectureReport, createGlossary, EDU_GLOSSARY } from "./report.ts";
export { eduGenesisNotes, EDU_STAGE_ORDER, type EduNote, type EduStage } from "./genesis.ts";
export { gpa, gpaGrade, weakest, strongest, classHighlights, GRADE_COLOR, type Student } from "./quality.ts";
export { architectureSummary, helpWanted } from "./summary.ts";
export { diagramCanvas, drawDiagram } from "./diagrams.ts";
export { createRubricEditor, createJudgedCard, serverParse, defaultRubric, guessSignal, type ParseFn, type RubricEditor } from "./rubric.ts";
export { createFeedbackView, createClassFeedback, scoreRing } from "./feedback-view.ts";
export { SIGNALS, weightPercents, weightedScore, estimateFromQuality, classSummary, feedbackCsv, feedbackMarkdown, localDefaultRubric } from "./rubric-data.ts";
export { plainRow, nextGrade } from "./explain.ts";
