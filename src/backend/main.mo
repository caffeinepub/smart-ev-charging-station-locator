import Map "mo:core/Map";
import Float "mo:core/Float";
import Text "mo:core/Text";
import Array "mo:core/Array";
import Runtime "mo:core/Runtime";
import Iter "mo:core/Iter";
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

  let stations = Map.empty<Nat, Station>();
  let userProfiles = Map.empty<Principal, UserProfile>();

  let accessControlState = AccessControl.initState();
  include MixinAuthorization(accessControlState);

  public shared ({ caller }) func initialize() : async () {
    // Removed problematic call to access control initialization.

    stations.add(
      1,
      {
        id = 1;
        name = "EV Station A";
        latitude = 19.0765;
        longitude = 72.8777;
        chargingTypes = ["Fast Charging", "Slow Charging"];
        isAvailable = true;
      },
    );

    stations.add(
      2,
      {
        id = 2;
        name = "EV Station B";
        latitude = 19.07;
        longitude = 72.87;
        chargingTypes = ["Fast Charging", "Battery Swapping"];
        isAvailable = true;
      },
    );

    stations.add(
      3,
      {
        id = 3;
        name = "EV Station C";
        latitude = 19.082;
        longitude = 72.89;
        chargingTypes = ["Slow Charging", "Battery Swapping"];
        isAvailable = false;
      },
    );
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
        let updatedStation = { station with isAvailable };
        stations.add(id, updatedStation);
        true;
      };
    };
  };

  public query ({ caller }) func getCallerUserProfile() : async ?UserProfile {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can access profiles");
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
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can save profiles");
    };
    userProfiles.add(caller, profile);
  };
};
