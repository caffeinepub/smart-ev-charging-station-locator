import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface Booking {
    status: BookingStatus;
    bookingId: bigint;
    estimatedDurationMinutes: bigint;
    chargingType: string;
    vehiclePlate: string;
    scheduledTime: bigint;
    userId: Principal;
    stationId: bigint;
}
export interface Station {
    id: bigint;
    latitude: number;
    chargingTypes: Array<string>;
    name: string;
    isAvailable: boolean;
    longitude: number;
}
export interface UserProfile {
    name: string;
}
export enum BookingStatus {
    cancelled = "cancelled",
    pending = "pending",
    completed = "completed",
    confirmed = "confirmed"
}
export enum UserRole {
    admin = "admin",
    user = "user",
    guest = "guest"
}
export interface backendInterface {
    assignCallerUserRole(user: Principal, role: UserRole): Promise<void>;
    bookSlot(stationId: bigint, chargingType: string, vehiclePlate: string, scheduledTime: bigint, estimatedDurationMinutes: bigint): Promise<bigint>;
    cancelBooking(bookingId: bigint): Promise<boolean>;
    getAvailableSlots(stationId: bigint, dateStart: bigint, dateEnd: bigint): Promise<Array<{
        isAvailable: boolean;
        slotTime: bigint;
    }>>;
    getCallerUserProfile(): Promise<UserProfile | null>;
    getCallerUserRole(): Promise<UserRole>;
    getMyBookings(): Promise<Array<Booking>>;
    getStationBookings(stationId: bigint): Promise<Array<Booking>>;
    getStations(): Promise<Array<Station>>;
    getUserProfile(user: Principal): Promise<UserProfile | null>;
    initialize(): Promise<void>;
    isCallerAdmin(): Promise<boolean>;
    saveCallerUserProfile(profile: UserProfile): Promise<void>;
    updateStationAvailability(id: bigint, isAvailable: boolean): Promise<boolean>;
}
