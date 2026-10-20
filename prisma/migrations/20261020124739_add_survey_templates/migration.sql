-- CreateEnum
CREATE TYPE "SurveyQuestionType" AS ENUM ('MULTIPLE_CHOICE', 'OPEN_ENDED', 'LIKERT');

-- CreateEnum
CREATE TYPE "SurveyRecipientKind" AS ENUM ('CONTACT', 'EMAIL');

-- DropForeignKey
ALTER TABLE "crm_feedback_surveys" DROP CONSTRAINT "crm_feedback_surveys_contactId_fkey";

-- AlterTable (nullable once, backfilled below, then tightened to NOT NULL)
ALTER TABLE "crm_feedback_surveys" ADD COLUMN     "recipientEmail" TEXT,
ADD COLUMN     "recipientKind" "SurveyRecipientKind",
ADD COLUMN     "recipientName" TEXT,
ADD COLUMN     "responseToken" TEXT,
ADD COLUMN     "surveyId" TEXT,
ALTER COLUMN "contactId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "crm_surveys" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "crm_surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_survey_questions" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "type" "SurveyQuestionType" NOT NULL,
    "text" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "crm_survey_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_survey_question_options" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,

    CONSTRAINT "crm_survey_question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_survey_responses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "feedbackSurveyId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answerText" TEXT,
    "answerOptionId" TEXT,
    "answerLikertValue" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_survey_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_surveys_tenantId_idx" ON "crm_surveys"("tenantId");

-- CreateIndex
CREATE INDEX "crm_survey_questions_surveyId_idx" ON "crm_survey_questions"("surveyId");

-- CreateIndex
CREATE INDEX "crm_survey_question_options_questionId_idx" ON "crm_survey_question_options"("questionId");

-- CreateIndex
CREATE INDEX "crm_survey_responses_feedbackSurveyId_idx" ON "crm_survey_responses"("feedbackSurveyId");

-- AddForeignKey
ALTER TABLE "crm_surveys" ADD CONSTRAINT "crm_surveys_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_survey_questions" ADD CONSTRAINT "crm_survey_questions_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "crm_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_survey_question_options" ADD CONSTRAINT "crm_survey_question_options_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "crm_survey_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_survey_responses" ADD CONSTRAINT "crm_survey_responses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_survey_responses" ADD CONSTRAINT "crm_survey_responses_feedbackSurveyId_fkey" FOREIGN KEY ("feedbackSurveyId") REFERENCES "crm_feedback_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_survey_responses" ADD CONSTRAINT "crm_survey_responses_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "crm_survey_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_survey_responses" ADD CONSTRAINT "crm_survey_responses_answerOptionId_fkey" FOREIGN KEY ("answerOptionId") REFERENCES "crm_survey_question_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DataMigration: mevcut (prototip donemi) FeedbackSurvey kayitlari icin tenant basina
-- bir "Eski Anket (otomatik tasindi)" placeholder Survey olustur, sonra her satiri
-- buna ve kisinin ad/mailine baglayarak backfill et.
INSERT INTO "crm_surveys" ("id", "tenantId", "name", "description", "isActive", "createdById", "createdAt", "updatedAt")
SELECT gen_random_uuid(), t."tenantId", 'Eski Anket (otomatik tasindi)', 'Anket sablonlari eklenmeden once gonderilmis kayitlar icin otomatik olusturulmus yer tutucu.', false, u.id, now(), now()
FROM (SELECT DISTINCT "tenantId" FROM "crm_feedback_surveys") t
JOIN LATERAL (SELECT "id" FROM "users" WHERE "tenantId" = t."tenantId" ORDER BY "createdAt" ASC LIMIT 1) u ON true;

UPDATE "crm_feedback_surveys" fs
SET "surveyId" = sub."surveyId",
    "recipientKind" = 'CONTACT',
    "recipientName" = sub."recipientName",
    "recipientEmail" = sub."recipientEmail",
    "responseToken" = md5(random()::text || clock_timestamp()::text || fs."id")
FROM (
  SELECT
    fs2."id" AS "feedbackSurveyId",
    s."id" AS "surveyId",
    COALESCE(TRIM(CONCAT(c."firstName", ' ', c."lastName")), 'Bilinmiyor') AS "recipientName",
    COALESCE(c."email", 'bilinmiyor@example.com') AS "recipientEmail"
  FROM "crm_feedback_surveys" fs2
  JOIN "crm_surveys" s ON s."tenantId" = fs2."tenantId" AND s."name" = 'Eski Anket (otomatik tasindi)'
  LEFT JOIN "crm_contacts" c ON c."id" = fs2."contactId"
) sub
WHERE fs."id" = sub."feedbackSurveyId";

-- AlterTable (now backfilled, tighten to NOT NULL)
ALTER TABLE "crm_feedback_surveys"
  ALTER COLUMN "recipientEmail" SET NOT NULL,
  ALTER COLUMN "recipientKind" SET NOT NULL,
  ALTER COLUMN "recipientName" SET NOT NULL,
  ALTER COLUMN "responseToken" SET NOT NULL,
  ALTER COLUMN "surveyId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "crm_feedback_surveys_responseToken_key" ON "crm_feedback_surveys"("responseToken");

-- AddForeignKey
ALTER TABLE "crm_feedback_surveys" ADD CONSTRAINT "crm_feedback_surveys_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "crm_surveys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_feedback_surveys" ADD CONSTRAINT "crm_feedback_surveys_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "crm_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
