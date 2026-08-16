import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./errors";

export function jsonOk<T>(data: T, init?: { status?: number }) {
  return NextResponse.json(data, { status: init?.status ?? 200 });
}

export function jsonCreated<T>(data: T) {
  return NextResponse.json(data, { status: 201 });
}

export function jsonError(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: { message: error.message, code: error.code } },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          message: "Validation failed",
          code: "VALIDATION_ERROR",
          details: error.flatten(),
        },
      },
      { status: 400 },
    );
  }

  console.error(error);
  return NextResponse.json(
    { error: { message: "Internal server error", code: "INTERNAL" } },
    { status: 500 },
  );
}
