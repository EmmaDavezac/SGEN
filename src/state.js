const state = {
    currentUser: null,
    servicesList: [],
    selectedCategory: "semi",
    selectedService: null,
    pendingTransaction: null,
    pendingDeleteId: null,
    isEditingPrices: false,
    appointmentsList: [],
    expensesList: [],
    clientsList: [],
    cajaMovementsList: [],
    calendarDate: new Date(),
    selectedCalendarDay: new Date(),
    selectedExternalRemoval: null,
    allowFiado: localStorage.getItem("evolet_allow_fiado") === "true",
    allowRegisterTab: localStorage.getItem("evolet_allow_register_tab") === "true",
    allowCajasTab: localStorage.getItem("evolet_allow_cajas_tab") === "true",
    linkedAppointment: null
};

export default state;
