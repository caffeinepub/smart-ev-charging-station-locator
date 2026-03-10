import Map "mo:core/Map";
import Float "mo:core/Float";
import Text "mo:core/Text";
import List "mo:core/List";
import Nat "mo:core/Nat";
import Runtime "mo:core/Runtime";
import Principal "mo:core/Principal";
import MixinAuthorization "authorization/MixinAuthorization";
import AccessControl "authorization/access-control";

actor {
  public type Station = {
    id : Nat;
    name : Text;
    latitude : Float;
    longitude : Float;
    chargingTypes : [Text];
    isAvailable : Bool;
  };

  public type UserProfile = {
    name : Text;
  };

  public type BookingStatus = {
    #pending;
    #confirmed;
    #cancelled;
    #completed;
  };

  public type Booking = {
    bookingId : Nat;
    stationId : Nat;
    userId : Principal;
    vehiclePlate : Text;
    chargingType : Text;
    scheduledTime : Int;
    estimatedDurationMinutes : Nat;
    status : BookingStatus;
  };

  let stations = Map.empty<Nat, Station>();
  let userProfiles = Map.empty<Principal, UserProfile>();
  let bookings = Map.empty<Nat, Booking>();
  var nextBookingId = 1;

  let accessControlState = AccessControl.initState();
  include MixinAuthorization(accessControlState);

  public shared ({ caller }) func initialize() : async () {
    stations.add(1, {
      id = 1; name = "EV Station A";
      latitude = 19.0765; longitude = 72.8777;
      chargingTypes = ["Fast Charging", "Slow Charging"];
      isAvailable = true;
    });
    stations.add(2, {
      id = 2; name = "EV Station B";
      latitude = 19.07; longitude = 72.87;
      chargingTypes = ["Fast Charging", "Battery Swapping"];
      isAvailable = true;
    });
    stations.add(3, {
      id = 3; name = "EV Station C";
      latitude = 19.082; longitude = 72.89;
      chargingTypes = ["Slow Charging", "Battery Swapping"];
      isAvailable = false;
    });
  };

  public query func getStations() : async [Station] {
    stations.values().toArray();
  };

  public shared ({ caller }) func updateStationAvailability(id : Nat, isAvailable : Bool) : async Bool {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only admins can update station availability");
    };
    switch (stations.get(id)) {
      case (null) { false };
      case (?station) {
        stations.add(id, { station with isAvailable });
        true;
      };
    };
  };

  // Book a slot -- any authenticated (non-anonymous) user can book
  public shared ({ caller }) func bookSlot(
    stationId : Nat,
    chargingType : Text,
    vehiclePlate : Text,
    scheduledTime : Int,
    estimatedDurationMinutes : Nat,
  ) : async Nat {
    if (caller.isAnonymous()) {
      Runtime.trap("Unauthorized: Must be logged in to book slots");
    };

    var slotTaken = false;
    let slotEnd = scheduledTime + estimatedDurationMinutes.toInt() * 60_000_000_000;
    bookings.values().forEach(func(b) {
      if (
        b.stationId == stationId and
        (b.status == #confirmed or b.status == #pending) and
        scheduledTime < (b.scheduledTime + b.estimatedDurationMinutes.toInt() * 60_000_000_000) and
        slotEnd > b.scheduledTime
      ) { slotTaken := true };
    });

    if (slotTaken) { Runtime.trap("Slot already booked") };

    let newBooking : Booking = {
      bookingId = nextBookingId;
      stationId; userId = caller; vehiclePlate;
      chargingType; scheduledTime; estimatedDurationMinutes;
      status = #confirmed;
    };
    bookings.add(nextBookingId, newBooking);
    nextBookingId += 1;
    newBooking.bookingId;
  };

  public shared ({ caller }) func cancelBooking(bookingId : Nat) : async Bool {
    switch (bookings.get(bookingId)) {
      case (null) { Runtime.trap("Booking not found") };
      case (?booking) {
        if (booking.userId != caller and not AccessControl.isAdmin(accessControlState, caller)) {
          Runtime.trap("Unauthorized: Only the owner or admins can cancel bookings");
        };
        bookings.add(bookingId, { booking with status = #cancelled });
        true;
      };
    };
  };

  // Get bookings for the calling user -- any authenticated user
  public query ({ caller }) func getMyBookings() : async [Booking] {
    if (caller.isAnonymous()) {
      Runtime.trap("Unauthorized: Must be logged in");
    };
    let myBookings = List.empty<Booking>();
    bookings.values().forEach(func(booking) {
      if (booking.userId == caller) { myBookings.add(booking) };
    });
    myBookings.toArray();
  };

  public query func getStationBookings(stationId : Nat) : async [Booking] {
    let stationBookings = List.empty<Booking>();
    bookings.values().forEach(func(booking) {
      if (
        booking.stationId == stationId and
        (booking.status == #confirmed or booking.status == #pending)
      ) { stationBookings.add(booking) };
    });
    stationBookings.toArray();
  };

  // Returns slots 8am-10pm with real booking status
  public query func getAvailableSlots(
    stationId : Nat,
    dateStart : Int,
    dateEnd : Int,
  ) : async [{ slotTime : Int; isAvailable : Bool }] {
    let slots = List.empty<{ slotTime : Int; isAvailable : Bool }>();
    var currentTime = dateStart;
    let slotDuration = 1_800_000_000_000; // 30 min in nanoseconds

    while (currentTime + slotDuration <= dateEnd) {
      var isAvailable = true;
      let slotEnd = currentTime + slotDuration;

      bookings.values().forEach(func(booking) {
        if (
          booking.stationId == stationId and
          (booking.status == #confirmed or booking.status == #pending) and
          currentTime < (booking.scheduledTime + booking.estimatedDurationMinutes.toInt() * 60_000_000_000) and
          slotEnd > booking.scheduledTime
        ) { isAvailable := false };
      });

      slots.add({ slotTime = currentTime : Int; isAvailable });
      currentTime += slotDuration;
    };
    slots.toArray();
  };

  public query ({ caller }) func getCallerUserProfile() : async ?UserProfile {
    if (caller.isAnonymous()) {
      Runtime.trap("Unauthorized: Must be logged in");
    };
    userProfiles.get(caller);
  };

  public query ({ caller }) func getUserProfile(user : Principal) : async ?UserProfile {
    if (caller != user and not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Can only view your own profile");
    };
    userProfiles.get(user);
  };

  public shared ({ caller }) func saveCallerUserProfile(profile : UserProfile) : async () {
    if (caller.isAnonymous()) {
      Runtime.trap("Unauthorized: Must be logged in");
    };
    userProfiles.add(caller, profile);
  };
};
