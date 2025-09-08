import { AuthState, Action } from "@/types/types";

export const Reducer = (state:AuthState, action:Action) => {
	switch(action.type)
	{
		case 'Start_Login':
			return {user:null, loading:true, error:null}
		case 'Success_Login':
			return {user:action.payload, loading:false, error:null}
		case 'Failed_Login':
			return {user:null, loading:false, error:action.payload}
		case 'Persist_Login':
			return {...state, user: action.payload}
		case 'Update_User_Alias':
			return {...state, user: {...state.user!, user: {...state.user!.user, alias: action.payload}}}
		default :
			return state
	}
}