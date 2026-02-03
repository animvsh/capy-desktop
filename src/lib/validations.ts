import { z } from "zod";

// Lead validation schema
export const leadSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(100, "Name must be less than 100 characters"),
  email: z
    .string()
    .trim()
    .email("Invalid email address")
    .max(255, "Email must be less than 255 characters"),
  company: z
    .string()
    .trim()
    .max(100, "Company name must be less than 100 characters")
    .optional()
    .nullable(),
  title: z
    .string()
    .trim()
    .max(100, "Title must be less than 100 characters")
    .optional()
    .nullable(),
});

export type LeadInput = z.infer<typeof leadSchema>;

// ICP Profile validation schema
export const icpProfileSchema = z.object({
  what_you_sell: z
    .string()
    .trim()
    .max(500, "Description must be less than 500 characters")
    .optional()
    .nullable(),
  who_is_it_for: z
    .string()
    .trim()
    .max(500, "Description must be less than 500 characters")
    .optional()
    .nullable(),
  problem_solved: z
    .string()
    .trim()
    .max(500, "Description must be less than 500 characters")
    .optional()
    .nullable(),
  ideal_customer: z
    .string()
    .trim()
    .max(500, "Description must be less than 500 characters")
    .optional()
    .nullable(),
  who_to_avoid: z
    .string()
    .trim()
    .max(500, "Description must be less than 500 characters")
    .optional()
    .nullable(),
  tone: z.number().min(0).max(100).optional().nullable(),
  success_definition: z
    .string()
    .trim()
    .max(200, "Success definition must be less than 200 characters")
    .optional()
    .nullable(),
});

export type IcpProfileInput = z.infer<typeof icpProfileSchema>;

// Blacklist entry validation schema
export const blacklistEntrySchema = z.object({
  domain: z
    .string()
    .trim()
    .max(255, "Domain must be less than 255 characters")
    .optional()
    .nullable(),
  company_name: z
    .string()
    .trim()
    .max(100, "Company name must be less than 100 characters")
    .optional()
    .nullable(),
  industry: z
    .string()
    .trim()
    .max(100, "Industry must be less than 100 characters")
    .optional()
    .nullable(),
  reason: z
    .string()
    .trim()
    .max(500, "Reason must be less than 500 characters")
    .optional()
    .nullable(),
}).refine(
  (data) => data.domain || data.company_name || data.industry,
  "Either domain, company name, or industry is required"
);

export type BlacklistEntryInput = z.infer<typeof blacklistEntrySchema>;

// Email content validation schema
export const emailContentSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(1, "Subject is required")
    .max(200, "Subject must be less than 200 characters"),
  content: z
    .string()
    .trim()
    .min(1, "Email content is required")
    .max(5000, "Email content must be less than 5000 characters"),
});

export type EmailContentInput = z.infer<typeof emailContentSchema>;

// Message validation schema
export const messageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Message content is required")
    .max(5000, "Message must be less than 5000 characters"),
});

export type MessageInput = z.infer<typeof messageSchema>;

// Lead discovery validation schema
export const leadDiscoverySchema = z.object({
  job_titles: z
    .array(z.string().trim().max(100))
    .min(1, "At least one job title is required")
    .max(10, "Maximum 10 job titles allowed"),
  locations: z
    .array(z.string().trim().max(100))
    .max(10, "Maximum 10 locations allowed")
    .optional(),
  industries: z
    .array(z.string().trim().max(100))
    .max(10, "Maximum 10 industries allowed")
    .optional(),
  company_size: z
    .string()
    .trim()
    .max(50, "Company size must be less than 50 characters")
    .optional(),
  limit: z.number().min(1).max(100).default(25),
});

export type LeadDiscoveryInput = z.infer<typeof leadDiscoverySchema>;

// CSV row validation schema
export const csvRowSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Invalid email address").max(255),
  company: z.string().trim().max(100).optional().nullable(),
  title: z.string().trim().max(100).optional().nullable(),
});

export type CSVRowInput = z.infer<typeof csvRowSchema>;

// Helper function to validate and get errors
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: string[] } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.errors.map((e) => e.message),
  };
}

// Rate limit error detection
export function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("rate limit") ||
      message.includes("too many requests") ||
      message.includes("429")
    );
  }
  return false;
}

// Payment required error detection
export function isPaymentRequiredError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("payment required") ||
      message.includes("402") ||
      message.includes("quota exceeded")
    );
  }
  return false;
}

// Get user-friendly error message
export function getErrorMessage(error: unknown): string {
  if (isRateLimitError(error)) {
    return "You've hit the rate limit. Please wait a few minutes and try again.";
  }
  if (isPaymentRequiredError(error)) {
    return "Your quota has been exceeded. Please check your subscription.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "An unexpected error occurred. Please try again.";
}
