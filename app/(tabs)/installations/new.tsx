import * as DocumentPicker from 'expo-document-picker';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { BusinessNameField } from '@/components/BusinessNameField';
import { Screen } from '@/components/Screen';
import { Banner, Button, Field } from '@/components/ui/kit';
import { Select } from '@/components/ui/Select';
import { ApiError } from '@/lib/api';
import { useApi, useAuth } from '@/lib/auth';
import { useQuery } from '@/lib/hooks';
import { BUSINESS_TYPES, INDIAN_STATES } from '@/lib/options';
import { colors, fontSize, spacing } from '@/lib/theme';
import type { PickedDocument, User } from '@/lib/types';

type InvoiceMode = 'later' | 'enter';

const PINCODE_RE = /^\d{4,10}$/;

// Stored as the invoice number when the user defers entering one. The backend
// requires a non-empty string, so this sentinel keeps the field valid.
const INVOICE_DEFERRED = 'To be added later';

export default function NewInstallationScreen() {
  const api = useApi();
  const router = useRouter();
  const { user } = useAuth();

  const isEngineer = user?.role === 'ENGINEER';
  // Only Admin/Manager can pre-assign an engineer or credit a sales rep.
  const canAssign = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [businessName, setBusinessName] = useState('');
  const [businessCategory, setBusinessCategory] = useState('');
  // Free-text category, used only when businessCategory === 'Other'.
  const [businessCategoryOther, setBusinessCategoryOther] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [products, setProducts] = useState('');
  const [invoiceMode, setInvoiceMode] = useState<InvoiceMode>('later');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDoc, setInvoiceDoc] = useState<PickedDocument | null>(null);
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [addressLine3, setAddressLine3] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState<string | null>(null);
  const [pincode, setPincode] = useState('');
  const [assignedEngineerId, setAssignedEngineerId] = useState<string | null>(null);
  const [salesRepId, setSalesRepId] = useState<string | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  // Engineers can open installations but not pre-assign them — their
  // installation lands in the admin queue tagged "Opened by <name>".
  const { data: engineers } = useQuery<User[]>(
    () => (isEngineer ? Promise.resolve([]) : api.listEngineers()),
    [isEngineer]
  );

  // Sales reps for the "sourced by" picker — only Admin/Manager pick one.
  const { data: salesReps } = useQuery<User[]>(
    () => (canAssign ? api.listSalesReps() : Promise.resolve([])),
    [canAssign]
  );

  const engineerOptions = [
    { label: 'None (unassigned)', value: '' },
    ...(engineers ?? []).map((e) => ({
      label: e.role === 'SALES' ? `${e.name} (Sales rep)` : e.name,
      value: String(e.id),
    })),
  ];

  const salesRepOptions = [
    { label: 'None', value: '' },
    ...(salesReps ?? []).map((r) => ({ label: r.name, value: String(r.id) })),
  ];

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!businessName.trim()) errs.businessName = 'Business name is required.';
    if (!businessCategory.trim()) errs.businessCategory = 'Business category is required.';
    else if (businessCategory === 'Other' && businessCategoryOther.trim().length < 2)
      errs.businessCategoryOther = 'Please specify the business category.';
    if (!contactName.trim()) errs.contactName = 'Contact name is required.';
    if (!phone.trim()) errs.phone = 'Phone number is required.';
    if (invoiceMode === 'enter' && !invoiceNumber.trim())
      errs.invoiceNumber = 'Enter the invoice number, or choose “To be added later”.';
    if (products.trim().length < 2) errs.products = 'List the products to be installed.';
    if (addressLine1.trim().length < 3) errs.addressLine1 = 'Address line 1 is required.';
    if (city.trim().length < 2) errs.city = 'City is required.';
    if (!stateName) errs.state = 'Select a state.';
    if (!PINCODE_RE.test(pincode.trim())) errs.pincode = 'Enter a valid pincode (digits only).';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const pickInvoiceDoc = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      setInvoiceDoc({
        uri: asset.uri,
        name: asset.name ?? 'invoice',
        type: asset.mimeType ?? 'application/octet-stream',
      });
    } catch {
      Alert.alert('Invoice document', 'Could not open the document picker.');
    }
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
        products_for_installation: string;
        address_line1: string;
        address_line2?: string;
        address_line3?: string;
        city: string;
        state: string;
        pincode: string;
        assigned_engineer_id?: number;
        sales_rep_id?: number;
      } = {
        business_name: businessName.trim(),
        business_category:
          businessCategory === 'Other' && businessCategoryOther.trim()
            ? businessCategoryOther.trim()
            : businessCategory.trim(),
        contact_name: contactName.trim(),
        phone: phone.trim(),
        invoice_number:
          invoiceMode === 'later' ? INVOICE_DEFERRED : invoiceNumber.trim(),
        products_for_installation: products.trim(),
        address_line1: addressLine1.trim(),
        city: city.trim(),
        state: stateName!,
        pincode: pincode.trim(),
      };
      if (email.trim()) body.email = email.trim();
      if (addressLine2.trim()) body.address_line2 = addressLine2.trim();
      if (addressLine3.trim()) body.address_line3 = addressLine3.trim();
      if (assignedEngineerId) body.assigned_engineer_id = Number(assignedEngineerId);
      if (canAssign && salesRepId) body.sales_rep_id = Number(salesRepId);

      const created = await api.createInstallation(body);

      // Optional invoice document. The installation already exists, so a failed
      // upload must not block navigation — surface it and let the user retry
      // from the installation screen (re-submitting would create a duplicate).
      if (invoiceDoc) {
        try {
          await api.uploadInstallationInvoiceDocument(created.reference, invoiceDoc);
        } catch (e) {
          const msg = e instanceof ApiError ? e.message : 'upload failed';
          Alert.alert(
            'Invoice document',
            `Installation ${created.reference} was created, but the document didn't upload: ${msg}. You can add it from the installation page.`,
          );
        }
      }

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

      <BusinessNameField
        required
        value={businessName}
        onChangeText={setBusinessName}
        onSelectSuggestion={(s) => {
          // Category is a fixed-option picker here (no free-text), so only
          // pre-fill when the stored category is one of our preset types.
          const type = s.business_type?.trim();
          if (type && (BUSINESS_TYPES as readonly string[]).includes(type)) {
            setBusinessCategory(type);
          }
        }}
        placeholder="e.g. Spice Garden Restaurant"
        error={errors.businessName}
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

      {businessCategory === 'Other' && (
        <Field
          label="Specify business category"
          required
          value={businessCategoryOther}
          onChangeText={setBusinessCategoryOther}
          placeholder="Please specify the business category"
          autoCapitalize="words"
          error={errors.businessCategoryOther}
        />
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

      <Field
        label="Products for Installation"
        required
        value={products}
        onChangeText={setProducts}
        placeholder={'One product per line — name and quantity\ne.g. POS Machine x 2'}
        error={errors.products}
        multiline
        numberOfLines={4}
        autoCapitalize="words"
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

      <Text style={styles.docLabel}>Invoice Document (optional)</Text>
      <Pressable onPress={pickInvoiceDoc} style={styles.docPicker}>
        <Text style={invoiceDoc ? styles.docName : styles.docPlaceholder} numberOfLines={1}>
          {invoiceDoc ? invoiceDoc.name : 'Attach a PDF or image…'}
        </Text>
      </Pressable>
      {invoiceDoc && (
        <View style={styles.docActions}>
          <Pressable onPress={pickInvoiceDoc} hitSlop={8}>
            <Text style={styles.docAction}>Replace</Text>
          </Pressable>
          <Pressable onPress={() => setInvoiceDoc(null)} hitSlop={8}>
            <Text style={styles.docRemove}>Remove</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.sectionLabel}>Site Address</Text>

      <Field
        label="Address line 1"
        required
        value={addressLine1}
        onChangeText={setAddressLine1}
        placeholder="Building name, floor, street"
        error={errors.addressLine1}
      />

      <Field
        label="Address line 2"
        value={addressLine2}
        onChangeText={setAddressLine2}
        placeholder="Area, locality (optional)"
      />

      <Field
        label="Address line 3"
        value={addressLine3}
        onChangeText={setAddressLine3}
        placeholder="Landmark, additional info (optional)"
      />

      <Field
        label="City"
        required
        value={city}
        onChangeText={setCity}
        placeholder="Bengaluru"
        error={errors.city}
        autoCapitalize="words"
      />

      <Select
        label="State"
        required
        value={stateName}
        onChange={setStateName}
        placeholder="Select state"
        sheetTitle="State"
        options={INDIAN_STATES.map((s) => ({ label: s, value: s }))}
      />
      {!!errors.state && <Text style={styles.fieldError}>{errors.state}</Text>}

      <Field
        label="Pincode"
        required
        value={pincode}
        onChangeText={setPincode}
        placeholder="560001"
        error={errors.pincode}
        keyboardType="number-pad"
        autoCapitalize="none"
      />

      {!isEngineer && (
        <>
          <Text style={styles.sectionLabel}>Assignment (optional)</Text>

          <Select
            label="Assign to"
            value={assignedEngineerId}
            onChange={(v) => setAssignedEngineerId(v || null)}
            placeholder="None (unassigned)"
            sheetTitle="Assign to"
            options={engineerOptions}
          />
        </>
      )}

      {canAssign && (
        <>
          <Text style={styles.sectionLabel}>Sales Representative (optional)</Text>

          <Select
            label="Sourced by"
            value={salesRepId}
            onChange={(v) => setSalesRepId(v || null)}
            placeholder="None"
            sheetTitle="Sales Representative"
            options={salesRepOptions}
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
  docLabel: {
    fontSize: fontSize.sm,
    color: colors.inkSubtle,
    fontWeight: '500',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  docPicker: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  docPlaceholder: { fontSize: fontSize.sm, color: colors.inkSubtle },
  docName: { fontSize: fontSize.sm, color: colors.ink },
  docActions: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.xs },
  docAction: { fontSize: fontSize.sm, color: colors.info, fontWeight: '500' },
  docRemove: { fontSize: fontSize.sm, color: colors.danger, fontWeight: '500' },
});
