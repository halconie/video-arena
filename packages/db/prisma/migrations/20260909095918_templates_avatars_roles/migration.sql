-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'EXPORTED');

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'user';

-- CreateTable
CREATE TABLE "avatar" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "avatar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "avatarCount" INTEGER NOT NULL DEFAULT 1,
    "audioUrl" TEXT,
    "durationSeconds" INTEGER NOT NULL DEFAULT 60,
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "previewVideoUrl" TEXT,
    "thumbnailUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_block" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "startSeconds" INTEGER NOT NULL,
    "endSeconds" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "resolution" TEXT NOT NULL DEFAULT '720p',
    "aspectRatio" TEXT NOT NULL DEFAULT '16:9',
    "startFrameUrl" TEXT,
    "endFrameUrl" TEXT,
    "referenceImageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "swapStartFrame" BOOLEAN NOT NULL DEFAULT false,
    "swapEndFrame" BOOLEAN NOT NULL DEFAULT false,
    "avatarSlot" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_render" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "avatarIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isPreview" BOOLEAN NOT NULL DEFAULT false,
    "status" "GenerationStatus" NOT NULL DEFAULT 'PENDING',
    "outputUrl" TEXT,
    "thumbnailUrl" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "template_render_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rendered_block" (
    "id" TEXT NOT NULL,
    "renderId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "status" "GenerationStatus" NOT NULL DEFAULT 'PENDING',
    "outputUrl" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rendered_block_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "avatar_userId_idx" ON "avatar"("userId");

-- CreateIndex
CREATE INDEX "template_createdById_idx" ON "template"("createdById");

-- CreateIndex
CREATE INDEX "video_block_templateId_idx" ON "video_block"("templateId");

-- CreateIndex
CREATE INDEX "template_render_templateId_idx" ON "template_render"("templateId");

-- CreateIndex
CREATE INDEX "template_render_userId_idx" ON "template_render"("userId");

-- CreateIndex
CREATE INDEX "rendered_block_renderId_idx" ON "rendered_block"("renderId");

-- CreateIndex
CREATE UNIQUE INDEX "rendered_block_renderId_blockId_key" ON "rendered_block"("renderId", "blockId");

-- AddForeignKey
ALTER TABLE "avatar" ADD CONSTRAINT "avatar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template" ADD CONSTRAINT "template_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_block" ADD CONSTRAINT "video_block_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_render" ADD CONSTRAINT "template_render_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_render" ADD CONSTRAINT "template_render_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rendered_block" ADD CONSTRAINT "rendered_block_renderId_fkey" FOREIGN KEY ("renderId") REFERENCES "template_render"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rendered_block" ADD CONSTRAINT "rendered_block_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "video_block"("id") ON DELETE CASCADE ON UPDATE CASCADE;
