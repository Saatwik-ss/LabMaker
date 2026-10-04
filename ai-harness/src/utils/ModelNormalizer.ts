/**
 * ModelNormalizer maps deprecated model names to current active LLM models
 * and provides domain-specific context analysis.
 */
export function normalizeLlmModel(
  model?: unknown,
  defaultModel = 'llama-3.1-8b-instant'
): string {
  if (!model || typeof model !== 'string') return defaultModel;
  const m = model.trim().toLowerCase();

  // Groq model deprecation mappings
  if (
    m.includes('llama-3.1-70b') ||
    m === 'llama3-70b-8192' ||
    m === 'llama-3-70b' ||
    m === 'llama-3.1-70b-versatile'
  ) {
    return 'llama-3.3-70b-versatile';
  }

  if (
    m === 'llama3-8b-8192' ||
    m === 'llama-3-8b' ||
    m === 'llama-3.1-8b'
  ) {
    return 'llama-3.1-8b-instant';
  }

  if (m.includes('mixtral')) {
    return 'mixtral-8x7b-32768';
  }

  if (m.includes('gemini-2') || m.includes('gemini')) {
    return 'gemini-2.5-flash';
  }

  if (m.includes('gpt-4o-mini')) {
    return 'gpt-4o-mini';
  }

  if (m.includes('gpt-4o') || m === 'gpt-4') {
    return 'gpt-4o';
  }

  return model.trim();
}

export function isDeprecatedGroqModel(model?: unknown): boolean {
  if (!model || typeof model !== 'string') return false;
  const m = model.trim().toLowerCase();
  return (
    m.includes('llama-3.1-70b') ||
    m === 'llama3-70b-8192' ||
    m === 'llama3-8b-8192'
  );
}

export interface DomainContextInfo {
  domain: 'logistics' | 'ecommerce' | 'health' | 'fintech' | 'general';
  entityName: string;
  keyConcepts: string[];
}

export function detectProjectDomain(nameOrDesc: string): DomainContextInfo {
  const text = (nameOrDesc || '').toLowerCase();

  if (
    text.includes('logistic') ||
    text.includes('fleet') ||
    text.includes('telematics') ||
    text.includes('shipment') ||
    text.includes('tracking') ||
    text.includes('routing')
  ) {
    return {
      domain: 'logistics',
      entityName: 'Shipment',
      keyConcepts: ['vehicleId', 'gpsCoordinates', 'speed', 'telemetryPacket', 'routeWaypoints', 'etaMinutes', 'deliveryStatus'],
    };
  }

  if (
    text.includes('commerce') ||
    text.includes('shop') ||
    text.includes('store') ||
    text.includes('cart') ||
    text.includes('checkout')
  ) {
    return {
      domain: 'ecommerce',
      entityName: 'Order',
      keyConcepts: ['orderId', 'customerId', 'items', 'subtotal', 'paymentStatus', 'inventorySku'],
    };
  }

  if (
    text.includes('health') ||
    text.includes('medical') ||
    text.includes('patient') ||
    text.includes('clinic')
  ) {
    return {
      domain: 'health',
      entityName: 'PatientRecord',
      keyConcepts: ['patientId', 'vitals', 'fhirResource', 'appointmentDate', 'diagnosisCode'],
    };
  }

  if (
    text.includes('pay') ||
    text.includes('fintech') ||
    text.includes('bank') ||
    text.includes('ledger')
  ) {
    return {
      domain: 'fintech',
      entityName: 'Transaction',
      keyConcepts: ['transactionId', 'amount', 'currency', 'sourceAccount', 'idempotencyKey', 'settlementStatus'],
    };
  }

  return {
    domain: 'general',
    entityName: 'ResourceItem',
    keyConcepts: ['id', 'name', 'status', 'createdAt', 'updatedAt', 'metadata'],
  };
}
