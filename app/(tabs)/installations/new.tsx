import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Screen } from '@/components/Screen';
import { Banner, Button, Field } from '@/components/ui/kit';
import { Select } from '@/components/ui/Select';
import { ApiError } from '@/lib/api';
import { useApi, useAuth } from '@/lib/auth';
import { useQuery } from '@/lib/hooks';
import { BUSINESS_TYPES } from '@/lib/options';
import { colors, fontSize, spacing } from '@/lib/theme';
import type { User } from '@/lib/types';

type InvoiceMode = 'later' | 'enter';

// Stored as the invoice number when the user defers entering one. The backend
// requires a non-empty string, so this sentinel keeps the field valid.
const INVOICE_DEFERRED = 'To be added later';

export default function NewInstallationScreen() {
  const api = useApi();
  const router = useRouter();
  const { user } = useAuth();

  const isEngineer = user?.role === 'ENGINEER';

  const [businessName, setBusinessName] = useState('');
  const [businessCategory, setBusinessCategory] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [invoiceMode, setInvoiceMode] = useState<InvoiceMode>('later');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [assignedEngineerId, setAssignedEngineerId] = useState<string | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  // Engineers can open installations but not pre-assign them — their
  // installation lands in the admin queue tagged "Opened by <name>".
  const { data: engineers } = useQuery<User[]>(
    () => (isEngineer ? Promise.resolve([]) : api.listEngineers()),
    [isEngineer]
  );

  const engineerOptions = [
    { label: 'None (unassigned)', value: '' },
    ...(engineers ?? []).map((e) => ({ label: e.name, value: String(e.id) })),
  ];

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!businessName.trim()) errs.businessName = 'Business name is required.';
    if (!businessCategory.trim()) errs.businessCategory = 'Business category is required.';
    if (!contactName.trim()) errs.contactName = 'Contact name is required.';
    if (!phone.trim()) errs.phone = 'Phone number is required.';
    if (invoiceMode === 'enter' && !invoiceNumber.trim())
      errs.invoiceNumber = 'Enter the invoice number, or choose “To be added later”.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    setBanner(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      const body: {
        business_name: string;
        business_category: string;
        contact_name: string;
        phone: string;
        email?: string;
        invoice_number: string;
        assigned_engineer_id?: number;
      } = {
        business_name: businessName.trim(),
        business_category: businessCategory.trim(),
        contact_name: contactName.trim(),
        phone: phone.trim(),
        invoice_number:
          invoiceMode === 'later' ? INVOICE_DEFERRED : invoiceNumber.trim(),
      };
      if (email.trim()) body.email = email.trim();
      if (assignedEngineerId) body.assigned_engineer_id = Number(assignedEngineerId);

      const created = await api.createInstallation(body);
      router.replace({
        pathname: '/(tabs)/installations/[reference]',
        params: { reference: created.reference },
      });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message ?? 'Failed to create installation.';
      setBanner(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen scroll padded>
      <Stack.Screen options={{ title: 'New Installation' }} />

      {banner && <Banner message={banner} tone="danger" />}

      <Text style={styles.sectionLabel}>Business Details</Text>

      <Field
        label="Business Name"
        required
        value={businessName}
        onChangeText={setBusinessName}
        placeholder="e.g. Spice Garden Restaurant"
        error={errors.businessName}
        autoCapitalize="words"
      />

      <Select
        label="Business Category"
        required
        value={businessCategory || null}
        onChange={setBusinessCategory}
        placeholder="Select category…"
        sheetTitle="Business Category"
        options={BUSINESS_TYPES.map((t) => ({ label: t, value: t }))}
      />
      {!!errors.businessCategory && (
        <Text style={styles.fieldError}>{errors.businessCategory}</Text>
      )}

      <Text style={styles.sectionLabel}>Contact</Text>

      <Field
        label="Contact Name"
        required
        value={contactName}
        onChangeText={setContactName}
        placeholder="e.g. Ramesh Kumar"
        error={errors.contactName}
        autoCapitalize="words"
      />

      <Field
        label="Phone"
        required
        value={phone}
        onChangeText={setPhone}
        placeholder="e.g. 9876543210"
        error={errors.phone}
        keyboardType="phone-pad"
        autoCapitalize="none"
      />

      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="optional"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={styles.sectionLabel}>Invoice</Text>

      <Select
        label="Invoice Number"
        required
        value={invoiceMode}
        onChange={(v) => {
          const mode = (v as InvoiceMode) || 'later';
          setInvoiceMode(mode);
          if (mode !== 'enter') setInvoiceNumber('');
        }}
        placeholder="Select…"
        sheetTitle="Invoice Number"
        options={[
          { label: INVOICE_DEFERRED, value: 'later' },
          { label: 'Enter invoice number', value: 'enter' },
        ]}
      />

      {invoiceMode === 'enter' && (
        <Field
          label="Invoice Number"
          required
          value={invoiceNumber}
          onChangeText={setInvoiceNumber}
          placeholder="e.g. INV-2024-001"
          error={errors.invoiceNumber}
          autoCapitalize="characters"
          autoCorrect={false}
        />
      )}

      {!isEngineer && (
        <>
          <Text style={styles.sectionLabel}>Assignment (optional)</Text>

          <Select
            label="Assign Engineer"
            value={assignedEngineerId}
            onChange={(v) => setAssignedEngineerId(v || null)}
            placeholder="None (unassigned)"
            sheetTitle="Assign Engineer"
            options={engineerOptions}
          />
        </>
      )}

      <Button
        title="Create Installation"
        onPress={handleSubmit}
        loading={submitting}
        icon="add-circle-outline"
        style={{ marginTop: spacing.sm }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceRaised },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: colors.inkSubtle,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
  },
  fieldError: { fontSize: fontSize.xs, color: colors.danger, marginTop: -spacing.sm },
});
