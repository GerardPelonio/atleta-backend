export interface InquiryValidationError {
  field: string;
  message: string;
}

export function validateInquirySubmission(body: Record<string, unknown>): InquiryValidationError[] {
  const errors: InquiryValidationError[] = [];

  // coach_id validation
  if (!body.coach_id || typeof body.coach_id !== 'string' || (body.coach_id as string).trim().length === 0) {
    errors.push({
      field: 'coach_id',
      message: 'coach_id is required and must be a non-empty string.',
    });
  }

  // message validation (Optional, Max 1000 characters)
  if (body.message !== undefined && body.message !== null) {
    if (typeof body.message !== 'string') {
      errors.push({
        field: 'message',
        message: 'message must be a string if provided.',
      });
    } else if (body.message.length > 1000) {
      errors.push({
        field: 'message',
        message: 'message cannot exceed 1000 characters.',
      });
    }
  }

  return errors;
}
