-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "image" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "resolution" TEXT NOT NULL,
    "aspectRatio" TEXT NOT NULL,
    "referenceImageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "GenerationStatus" NOT NULL DEFAULT 'PENDING',
    "outputUrl" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "image_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "face_swap" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "baseImageUrl" TEXT NOT NULL,
    "faceImageUrl" TEXT NOT NULL,
    "status" "GenerationStatus" NOT NULL DEFAULT 'PENDING',
    "outputUrl" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "face_swap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "image_userId_idx" ON "image"("userId");

-- CreateIndex
CREATE INDEX "face_swap_userId_idx" ON "face_swap"("userId");

-- AddForeignKey
ALTER TABLE "image" ADD CONSTRAINT "image_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "face_swap" ADD CONSTRAINT "face_swap_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
