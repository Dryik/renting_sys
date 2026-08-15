/**
 * The synthetic shop the rehearsal upgrades.
 *
 * Everything here is written through the installed application's own preload
 * bridge, so the rows are produced by the released 0.3.9 services exactly as a
 * real shop's would be — not inserted behind the app's back. That matters:
 * the point of the exercise is to migrate a file the shipped code wrote.
 *
 * The data is invented. No customer, vehicle, plate or contract here refers to
 * anything real.
 *
 * Amounts are chosen to be awkward on purpose: half-cent values that must
 * round the same way before and after, repeating decimals a REAL column cannot
 * hold exactly, and a commission rate that multiplies into a fraction of a
 * cent. If integer minor units changed any of them, the manifest comparison
 * fails.
 */

/** A 1x1 JPEG, so a captured photo produces a real file on disk. */
const jpegDataUrl =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

/**
 * Mileage fixtures live outside the browser expression so the fast unit suite
 * can reject an impossible seed before the Windows runner spends minutes
 * building and installing two application versions.
 */
export const seedMileageScenarios = Object.freeze({
  active: Object.freeze({ vehicle: 12000, out: 12000, in: null }),
  returned: Object.freeze({ vehicle: 8000, out: 8000, in: 8450 }),
  cancelled: Object.freeze({ vehicle: 500, out: 500, in: null }),
  draft: Object.freeze({ vehicle: 12000, out: null, in: null }),
  sold: Object.freeze({ vehicle: 12000, out: null, in: null }),
});

/**
 * Builds the expression handed to the page. It returns a JSON-serialisable
 * summary, and throws with the failing step's name if any call is rejected, so
 * a schema mismatch surfaces as "step X: <validation message>" rather than an
 * anonymous failure.
 */
export function buildSeedExpression({ ownerPassword = "1234" } = {}) {
  return `
    (async () => {
      const api = window.rentalApp;
      const summary = { steps: [] };
      let current = "start";

      const step = async (name, run) => {
        current = name;
        const value = await run();
        summary.steps.push(name);
        return value;
      };

      const iso = (daysFromNow, hour) => {
        const when = new Date();
        when.setDate(when.getDate() + daysFromNow);
        when.setHours(hour ?? 10, 0, 0, 0);
        return when.toISOString();
      };
      const mileage = ${JSON.stringify(seedMileageScenarios)};

      try {
        // --- users and settings -------------------------------------------
        const state = await api.auth.getState();

        if (state.needsOwnerSetup) {
          await step("owner setup", () =>
            api.auth.setupOwner({
              fullName: "Rehearsal Owner",
              username: "rehearsalowner",
              password: ${JSON.stringify(ownerPassword)},
              confirmPassword: ${JSON.stringify(ownerPassword)},
            }),
          );
        } else {
          await step("owner login", () =>
            api.auth.login({
              username: "rehearsalowner",
              password: ${JSON.stringify(ownerPassword)},
            }),
          );
        }

        const staff = await step("create staff user", () =>
          api.users.create({
            fullName: "Rehearsal Staff",
            username: "rehearsalstaff",
            password: "4321",
            confirmPassword: "4321",
            roleKey: "staff",
          }),
        );
        const staffUserId = staff?.id ?? staff?.user?.id ?? null;

        await step("save settings", async () => {
          const settings = await api.settings.get();
          return api.settings.save({
            ...settings,
            shopName: "Rehearsal Rentals",
            shopPhone: "0900000000",
            defaultLateFee: 25.5,
            enableClientDeposit: true,
            language: "en",
            reason: "upgrade rehearsal seed",
          });
        });

        // --- accessories ---------------------------------------------------
        const babySeat = await step("create accessory", () =>
          api.accessories.create({
            name: "Baby Seat",
            quantityOwned: 4,
            defaultCharge: 7.335,
            isActive: true,
            notes: null,
          }),
        );

        // --- vehicles ------------------------------------------------------
        const vehicle = async (plate, dailyPrice, deposit, commission, initialMileage) =>
          api.vehicles.create({
            type: "car",
            brand: "Rehearsal",
            model: "Model " + plate,
            plateNumber: plate,
            chassisNumber: "CHASSIS-" + plate,
            color: "White",
            year: 2021,
            dailyPrice,
            depositAmount: deposit,
            status: "available",
            mileage: initialMileage,
            insuranceExpiryDate: null,
            registrationExpiryDate: null,
            technicalInspectionExpiryDate: null,
            lastOilChangeDate: null,
            lastOilChangeMileage: null,
            notes: null,
            commissionRateOverride: commission,
          });

        const carActive = await step("vehicle for the active rental", () =>
          vehicle("REH-001", 33.33, 100.005, 2.675, mileage.active.vehicle),
        );
        const carReturned = await step("vehicle for the returned rental", () =>
          vehicle("REH-002", 19.99, 250.5, null, mileage.returned.vehicle),
        );
        const carCancelled = await step("vehicle for the cancelled rental", () =>
          vehicle("REH-003", 12.345, 75.25, null, mileage.cancelled.vehicle),
        );
        const carDraft = await step("vehicle for the draft rental", () =>
          vehicle("REH-004", 44.44, 0, null, mileage.draft.vehicle),
        );
        const carSold = await step("vehicle to sell", () =>
          vehicle("REH-005", 27.77, 60, null, mileage.sold.vehicle),
        );

        // --- customers -----------------------------------------------------
        const customer = async (name, phone, nationalId) =>
          api.customers.create({
            fullName: name,
            phone,
            secondaryPhone: null,
            nationalId,
            driverLicenseNo: "DL-" + nationalId,
            licenseExpiryDate: null,
            address: "Synthetic Street 1",
            notes: null,
          });

        const primary = await step("create customer", () =>
          customer("Synthetic Customer One", "0910000001", "ID-0001"),
        );
        const second = await step("create second customer", () =>
          customer("Synthetic Customer Two", "0910000002", "ID-0002"),
        );
        await step("create third customer", () =>
          customer("Synthetic Customer Three", "0910000003", "ID-0003"),
        );

        // --- uploaded files -------------------------------------------------
        await step("save captured photo", () =>
          api.attachments.saveCapturedPhoto({
            entityType: "customer",
            entityId: primary.id,
            imageDataUrl: ${JSON.stringify(jpegDataUrl)},
            cameraDeviceLabelSnapshot: "Synthetic Camera",
            notes: "rehearsal upload",
          }),
        );
        await step("save second captured photo", () =>
          api.attachments.saveCapturedPhoto({
            entityType: "customer",
            entityId: second.id,
            imageDataUrl: ${JSON.stringify(jpegDataUrl)},
            cameraDeviceLabelSnapshot: "Synthetic Camera",
            notes: "second rehearsal upload",
          }),
        );

        // --- rentals in all four states -------------------------------------
        const activeRental = await step("activate a rental", () =>
          api.rentals.activate({
            customerId: primary.id,
            vehicleId: carActive.id,
            startDatetime: iso(-3, 9),
            expectedReturnDatetime: iso(2, 9),
            dailyPrice: 33.33,
            depositRequired: 100.005,
            depositPaid: 50.5,
            mileageOut: mileage.active.out,
            fuelOut: "full",
            notesOut: "active rehearsal rental",
            salesUserId: staffUserId,
            accessories: [
              { accessoryId: babySeat.id, quantity: 2, unitCharge: 7.335, notes: null },
            ],
            // Both shapes of the nullable collateral column, so the pair has
            // a valued row and a null row to migrate.
            collateralItems: [
              {
                type: "passport",
                description: "Synthetic passport",
                referenceNumber: "P-0001",
                estimatedValue: 1250.005,
                currency: null,
                notes: null,
              },
              {
                type: "other_item",
                description: "Synthetic item with no stated value",
                referenceNumber: null,
                estimatedValue: null,
                currency: null,
                notes: null,
              },
            ],
          }),
        );

        const returnedRental = await step("activate the rental to return", () =>
          api.rentals.activate({
            customerId: second.id,
            vehicleId: carReturned.id,
            startDatetime: iso(-6, 9),
            expectedReturnDatetime: iso(-2, 9),
            dailyPrice: 19.99,
            depositRequired: 250.5,
            depositPaid: 250.5,
            mileageOut: mileage.returned.out,
            fuelOut: "half",
            notesOut: "to be returned",
            salesUserId: staffUserId,
            accessories: [],
            collateralItems: [],
          }),
        );

        await step("return that rental", () =>
          api.rentals.return({
            rentalId: returnedRental.id,
            actualReturnDatetime: iso(-1, 9),
            lateFeePerDay: 25.5,
            damageCharge: 15.555,
            discount: 3.33,
            mileageIn: mileage.returned.in,
            fuelIn: "half",
            damageNotes: "scratch",
            notesIn: "returned in the rehearsal",
            vehicleStatus: "available",
            accessoryReturns: [],
            collateralReturns: [],
          }),
        );

        const cancelledRental = await step("activate the rental to cancel", () =>
          api.rentals.activate({
            customerId: primary.id,
            vehicleId: carCancelled.id,
            startDatetime: iso(-1, 9),
            expectedReturnDatetime: iso(4, 9),
            dailyPrice: 12.345,
            depositRequired: 75.25,
            depositPaid: 0,
            mileageOut: mileage.cancelled.out,
            fuelOut: "full",
            notesOut: "to be cancelled",
            salesUserId: null,
            accessories: [],
            collateralItems: [],
          }),
        );
        await step("cancel that rental", () =>
          api.rentals.cancel({
            rentalId: cancelledRental.id,
            reason: "Customer changed plans during the rehearsal.",
          }),
        );

        const draftRental = await step("create a draft rental", () =>
          api.rentals.createDraft({
            customerId: second.id,
            vehicleId: carDraft.id,
            startDatetime: iso(1, 9),
            expectedReturnDatetime: iso(5, 9),
            dailyPrice: 44.44,
            depositRequired: 0,
            depositPaid: 0,
            mileageOut: null,
            fuelOut: null,
            notesOut: "draft rehearsal rental",
            salesUserId: null,
            accessories: [],
            collateralItems: [],
          }),
        );

        // --- payments, deposits and refunds ----------------------------------
        const payment = (rentalId, type, method, amount, note) =>
          api.payments.create({
            rentalId,
            type,
            method,
            amount,
            paymentDate: iso(0, 12),
            notes: note,
          });

        await step("record rent payment", () =>
          payment(activeRental.id, "rent", "cash", 66.66, "two days rent"),
        );
        await step("record deposit payment", () =>
          payment(activeRental.id, "deposit", "cash", 50.5, "deposit"),
        );
        await step("record extra charge", () =>
          payment(activeRental.id, "extra_charge", "card", 12.345, "cleaning"),
        );
        await step("record refund", () =>
          payment(returnedRental.id, "refund", "cash", 30.005, "deposit refund"),
        );

        // --- maintenance -------------------------------------------------------
        await step("record maintenance", () =>
          api.maintenance.create({
            vehicleId: carReturned.id,
            title: "Oil change",
            description: "Synthetic maintenance record",
            cost: 88.885,
            startDate: iso(-1, 8),
            endDate: null,
          }),
        );

        // --- accounting ---------------------------------------------------------
        await step("record expense", () =>
          api.accounting.createExpense({
            category: "fuel",
            location: "cash_drawer",
            method: "cash",
            amount: 41.115,
            expenseDate: iso(0, 11),
            vendorName: "Synthetic Fuel",
            vehicleId: carActive.id,
            notes: "rehearsal expense",
          }),
        );

        await step("record cash movement", () =>
          api.accounting.createCashMovement({
            type: "transfer",
            fromLocation: "cash_drawer",
            toLocation: "shop_safe",
            amount: 100.555,
            movementDate: iso(0, 13),
            notes: "rehearsal transfer",
          }),
        );

        await step("record accounting adjustment", () =>
          api.accounting.createAdjustment({
            location: "cash_drawer",
            direction: "increase",
            amount: 17.775,
            adjustmentDate: iso(0, 16),
            reason: "rehearsal adjustment",
            notes: null,
          }),
        );

        await step("save daily closing", () =>
          api.accounting.saveStaffDailyClosing({
            closingDate: iso(0, 18).slice(0, 10),
            countedCash: 512.345,
            notes: "rehearsal closing",
          }),
        );

        // --- employee loans -------------------------------------------------------
        let loanId = null;
        if (staffUserId) {
          const loan = await step("issue employee loan", () =>
            api.employeeLoans.create({
              employeeUserId: staffUserId,
              amount: 200.005,
              issuedAt: iso(-1, 10),
              sourceLocation: "cash_drawer",
              notes: "rehearsal loan",
            }),
          );
          loanId = loan?.id ?? null;

          if (loanId) {
            await step("repay part of the loan", () =>
              api.employeeLoans.repay({
                loanId,
                amount: 75.335,
                paymentDate: iso(0, 14),
                method: "cash",
                location: "cash_drawer",
                notes: "partial repayment",
              }),
            );
          }
        }

        // --- vehicle sales ----------------------------------------------------------
        await step("record vehicle sale", () =>
          api.vehicleSales.create({
            vehicleId: carSold.id,
            buyerName: "Synthetic Buyer",
            buyerPhone: "0910000009",
            buyerIdNumber: "ID-9999",
            saleDate: iso(0, 15).slice(0, 10),
            salePrice: 8750.555,
            paymentMethod: "cash",
            notes: "rehearsal sale",
          }),
        );

        // Audit rows are a side effect of every write above; this only proves
        // the log is non-empty before the upgrade.
        const audit = await step("read audit log", () => api.audit.list({ page: 1 }));

        summary.ok = true;
        summary.auditRows = audit?.total ?? audit?.rows?.length ?? 0;
        summary.rentalIds = {
          active: activeRental.id,
          returned: returnedRental.id,
          cancelled: cancelledRental.id,
          draft: draftRental.id,
        };
        summary.loanId = loanId;

        return summary;
      } catch (error) {
        return {
          ok: false,
          failedStep: current,
          completedSteps: summary.steps,
          message: error && error.message ? error.message : String(error),
        };
      }
    })()
  `;
}
