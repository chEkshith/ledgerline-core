/**
 * Maps known PostgreSQL SQLSTATE error codes raised by RLS/PLpgSQL procedures
 * to appropriate HTTP status codes.
 *
 * @param {Error & { code?: string }} err
 * @returns {number|null}
 */
export function mapSqlErrorStatus(err) {
  switch (err?.code) {
    case '42501': // insufficient_privilege
    case '28000': // invalid_authorization_specification
      return 403;
    case '02000': // no_data
      return 404;
    case '23505': // unique_violation
      return 409;
    case '22023': // invalid_parameter_value
    case '25000': // invalid_transaction_state (e.g. closed account, final holder)
    case '22P02': // invalid_text_representation (e.g. malformed UUID)
    case '22003': // numeric_value_out_of_range
      return 400;
    default:
      return null;
  }
}

