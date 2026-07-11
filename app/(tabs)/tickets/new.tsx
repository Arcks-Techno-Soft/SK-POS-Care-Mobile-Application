/**
 * Create a ticket on behalf of a customer.
 *
 * Mirrors the public web "Raise a ticket" form (frontend/components/ticket-form)
 * so staff can capture the same details when the customer can't submit it
 * themselves. Any staff member (Admin / Manager / Engineer) can raise one;
 * engineer-raised tickets land in the admin inbox tagged "Opened by <name>".
 */

import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BusinessNameField } from '@/components/BusinessNameField';
import { PhotoPicker } from '@/components/PhotoPicker';
import { Screen } from '@/components/Screen';
import { Banner, Button, Field } from '@/components/ui/kit';
import { Select } from '@/components/ui/Select';
import { ApiError } from '@/lib/api';
import { useApi } from '@/lib/auth';
import {
  BUSINESS_TYPES,
  INDIAN_STATES,
  ISSUE_CATEGORIES,
  PREFERRED_CONTACT_TIMES,
  PRODUCT_CATEGORIES,
} from '@/lib/options';
import { colors, fontSize, spacing } from '@/lib/theme';
import type { DuplicateInfo, PickedImage } from '@/lib/types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PINCODE_RE = /^\d{4,10}$/;

/** Normalise to a 10-digit Indian mobile, stripping a +91 / 91 / 0 prefix.
 *  Returns null if it isn't a valid 10-digit number starting 6-9. */
function normaliseIndianMobile(raw: string): string | null {
  let d = raw.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

export default function NewTicketScreen() {
  const api = useApi();
  const router = useRouter();

  // Business
  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState('');
  const [businessType, setBusinessType] = useState<string | null>(null);
  // Free-text category, used only when businessType === 'Other'.
  const [businessTypeOther, setBusinessTypeOther] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  // Address
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [addressLine3, setAddressLine3] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState<string | null>(null);
  const [pincode, setPincode] = useState('');

  // Product
  const [productCategory, setProductCategory] = useState<string | null>(null);
  // Free-text category, used only when productCategory === 'Other'.
  const [productCategoryOther, setProductCategoryOther] = useState('');
  const [serialNumber, setSerialNumber] = useState('');

  // Issue
  const [issueCategory, setIssueCategory] = useState<string | null>(null);
  // Free-text category, used only when issueCategory === 'Other'.
  const [issueCategoryOther, setIssueCategoryOther] = useState('');
  const [description, setDescription] = useState('');
  const [preferredContactTime, setPreferredContactTime] = useState<string | null>(null);

  // Attachments
  const [images, setImages] = useState<PickedImage[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (businessName.trim().length < 2) errs.businessName = 'Business name is required.';
    if (contactName.trim().length < 2) errs.contactName = 'Contact name is required.';
    if (!businessType) errs.businessType = 'Select a business type.';
    else if (businessType === 'Other' && businessTypeOther.trim().length < 2)
      errs.businessTypeOther = 'Please specify your business type.';

    if (!normaliseIndianMobile(phone)) errs.phone = 'Enter a valid 10-digit mobile number.';

    // Email is optional — only validate the format if something was entered.
    if (email.trim() && !EMAIL_RE.test(email.trim())) errs.email = 'Enter a valid email.';

    if (addressLine1.trim().length < 3) errs.addressLine1 = 'Address line 1 is required.';
    if (city.trim().length < 2) errs.city = 'City is required.';
    if (!stateName) errs.state = 'Select a state.';
    if (!PINCODE_RE.test(pincode.trim())) errs.pincode = 'Enter a valid pincode (digits only).';

    if (!productCategory) errs.productCategory = 'Select a product category.';
    else if (productCategory === 'Other' && productCategoryOther.trim().length < 2)
      errs.productCategoryOther = 'Please specify the product category.';
    if (serialNumber.trim().length < 3) errs.serialNumber = 'Enter the product serial number.';

    if (!issueCategory) errs.issueCategory = 'Select an issue category.';
    else if (issueCategory === 'Other' && issueCategoryOther.trim().length < 2)
      errs.issueCategoryOther = 'Please specify the issue category.';
    if (description.trim().length < 20)
      errs.description = 'Please describe the issue in at least 20 characters.';

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    setBanner(null);
    setDuplicate(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      const body: Parameters<typeof api.createTicket>[0] = {
        business_name: businessName.trim(),
        contact_name: contactName.trim(),
        phone: normaliseIndianMobile(phone) ?? phone.trim(),
        business_type:
          businessType === 'Other' && businessTypeOther.trim()
            ? businessTypeOther.trim()
            : businessType!,
        address_line1: addressLine1.trim(),
        city: city.trim(),
        state: stateName!,
        pincode: pincode.trim(),
        product_category:
          productCategory === 'Other' && productCategoryOther.trim()
            ? productCategoryOther.trim()
            : productCategory!,
        serial_number: serialNumber.trim(),
        issue_category:
          issueCategory === 'Other' && issueCategoryOther.trim()
            ? issueCategoryOther.trim()
            : issueCategory!,
        description: description.trim(),
      };
      if (email.trim()) body.email = email.trim();
      if (addressLine2.trim()) body.address_line2 = addressLine2.trim();
      if (addressLine3.trim()) body.address_line3 = addressLine3.trim();
      if (preferredContactTime) body.preferred_contact_time = preferredContactTime;

      const created = await api.createTicket(body, images);
      router.replace({
        pathname: '/(tabs)/tickets/[reference]',
        params: { reference: created.reference },
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.detail && typeof e.detail === 'object') {
        const d = (e.detail as { detail?: unknown }).detail ?? e.detail;
        if (d && typeof d === 'object' && 'existing_reference' in d) {
          setDuplicate(d as DuplicateInfo);
          return;
        }
      }
      const msg =
        e instanceof ApiError ? e.message : (e as Error).message ?? 'Failed to create ticket.';
      setBanner(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen scroll padded>
      <Stack.Screen options={{ title: 'New ticket' }} />

      {banner && <Banner message={banner} tone="danger" />}

      {duplicate && (
        <View style={styles.duplicate}>
          <Text style={styles.duplicateKicker}>Already tracked</Text>
          <Text style={styles.duplicateTitle}>
            Ticket {duplicate.existing_reference} is already open
          </Text>
          <Text style={styles.duplicateBody}>{duplicate.message}</Text>
          <Button
            title={`Open ${duplicate.existing_reference}`}
            variant="secondary"
            icon="open-outline"
            onPress={() =>
              router.replace({
                pathname: '/(tabs)/tickets/[reference]',
                params: { reference: duplicate.existing_reference },
              })
            }
            style={{ marginTop: spacing.sm }}
          />
        </View>
      )}

      <Text style={styles.sectionLabel}>Business</Text>

      <BusinessNameField
        required
        value={businessName}
        onChangeText={setBusinessName}
        onSelectSuggestion={(s) => {
          // Pre-fill the category from the picked business. A stored value not
          // in our preset list came in via "Other" — restore it that way.
          const type = s.business_type?.trim();
          if (!type) return;
          if ((BUSINESS_TYPES as readonly string[]).includes(type)) {
            setBusinessType(type);
            setBusinessTypeOther('');
          } else {
            setBusinessType('Other');
            setBusinessTypeOther(type);
          }
        }}
        placeholder="e.g. Spice Garden Restaurant"
        error={errors.businessName}
      />

      <Field
        label="Contact Person"
        required
        value={contactName}
        onChangeText={setContactName}
        placeholder="Customer's full name"
        error={errors.contactName}
        autoCapitalize="words"
      />

      <Select
        label="Business Type"
        required
        value={businessType}
        onChange={setBusinessType}
        placeholder="Choose business type"
        sheetTitle="Business Type"
        options={BUSINESS_TYPES.map((t) => ({ label: t, value: t }))}
      />
      {!!errors.businessType && <Text style={styles.fieldError}>{errors.businessType}</Text>}

      {businessType === 'Other' && (
        <Field
          label="Specify business type"
          required
          value={businessTypeOther}
          onChangeText={setBusinessTypeOther}
          placeholder="Please specify your business type"
          autoCapitalize="words"
          error={errors.businessTypeOther}
        />
      )}

      <Field
        label="Phone"
        required
        value={phone}
        onChangeText={setPhone}
        placeholder="+91 98xxxxxxxx"
        error={errors.phone}
        keyboardType="phone-pad"
        autoCapitalize="none"
      />

      <Field
        label="Email (optional)"
        value={email}
        onChangeText={setEmail}
        placeholder="customer@business.com"
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={styles.sectionLabel}>Address</Text>

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

      <Text style={styles.sectionLabel}>Product</Text>

      <Select
        label="Product category"
        required
        value={productCategory}
        onChange={setProductCategory}
        placeholder="Select product"
        sheetTitle="Product Category"
        options={PRODUCT_CATEGORIES.map((p) => ({ label: p, value: p }))}
      />
      {!!errors.productCategory && (
        <Text style={styles.fieldError}>{errors.productCategory}</Text>
      )}

      {productCategory === 'Other' && (
        <Field
          label="Specify product category"
          required
          value={productCategoryOther}
          onChangeText={setProductCategoryOther}
          placeholder="Please specify the product category"
          autoCapitalize="words"
          error={errors.productCategoryOther}
        />
      )}

      <Field
        label="Serial number"
        required
        value={serialNumber}
        onChangeText={setSerialNumber}
        placeholder="e.g. POSBK-2024-A1023"
        error={errors.serialNumber}
        autoCapitalize="characters"
        autoCorrect={false}
        hint="Used to track the device"
      />

      <Text style={styles.sectionLabel}>Issue</Text>

      <Select
        label="Issue category"
        required
        value={issueCategory}
        onChange={setIssueCategory}
        placeholder="Choose issue category"
        sheetTitle="Issue Category"
        options={ISSUE_CATEGORIES.map((i) => ({ label: i, value: i }))}
      />
      {!!errors.issueCategory && <Text style={styles.fieldError}>{errors.issueCategory}</Text>}

      {issueCategory === 'Other' && (
        <Field
          label="Specify issue category"
          required
          value={issueCategoryOther}
          onChangeText={setIssueCategoryOther}
          placeholder="Please specify the issue category"
          autoCapitalize="words"
          error={errors.issueCategoryOther}
        />
      )}

      <Field
        label="Describe the issue"
        required
        value={description}
        onChangeText={setDescription}
        placeholder="When did it start? Any error messages? What was the customer doing when it happened?"
        error={errors.description}
        multiline
        numberOfLines={5}
        textAlignVertical="top"
        hint="Min 20 characters"
      />

      <Select
        label="Preferred contact time"
        value={preferredContactTime}
        onChange={setPreferredContactTime}
        placeholder="Anytime"
        sheetTitle="Preferred contact time"
        options={PREFERRED_CONTACT_TIMES.map((t) => ({ label: t, value: t }))}
      />

      <Text style={styles.sectionLabel}>Attachments (optional)</Text>
      <Text style={styles.helpText}>
        Photos of the issue, error screen, or device speed up diagnosis.
      </Text>
      <PhotoPicker images={images} onChange={setImages} disabled={submitting} />

      <Button
        title="Create ticket"
        onPress={handleSubmit}
        loading={submitting}
        icon="add-circle-outline"
        style={{ marginTop: spacing.lg }}
      />

      <Text style={styles.footer}>
        Severity defaults to Medium — adjust it from the ticket detail screen after triage.
      </Text>
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
  helpText: { fontSize: fontSize.sm, color: colors.inkSubtle, marginTop: -spacing.xs },
  footer: {
    fontSize: fontSize.xs,
    color: colors.inkSubtle,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  duplicate: {
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.lg,
    gap: 4,
  },
  duplicateKicker: {
    fontSize: fontSize.xs,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.inkSubtle,
    fontWeight: '700',
  },
  duplicateTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.ink, marginTop: 4 },
  duplicateBody: { fontSize: fontSize.sm, color: colors.inkMuted, marginTop: 4 },
});
